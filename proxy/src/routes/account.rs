use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::crypto::verify_commitment;
use crate::proof::generate_account_proof;
use crate::routes::AppState;

/// Private getAccountInfo request
#[derive(Debug, Deserialize)]
pub struct PrivateAccountRequest {
    pub commitment: String,
    pub account_pubkey: String,
    pub nonce: String,
    pub timestamp: u64,
    // Optional: encrypted query for additional privacy
    pub encrypted_query: Option<String>,
    pub ephemeral_public_key: Option<String>,
}

/// Private getAccountInfo response
#[derive(Debug, Serialize)]
pub struct PrivateAccountResponse {
    pub data: Option<String>,
    pub owner: Option<String>,
    pub lamports: Option<u64>,
    pub slot: u64,
    pub executable: Option<bool>,
    pub merkle_proof: crate::proof::MerkleProof,
    pub commitment: String,
    pub verified: bool,
}

/// Error response
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
}

/// Private getAccountInfo endpoint
pub async fn get_account_info(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PrivateAccountRequest>,
) -> Result<Json<PrivateAccountResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Verify commitment matches query parameters
    if !verify_commitment(&req.account_pubkey, &req.nonce, req.timestamp, &req.commitment) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "commitment_mismatch".to_string(),
                message: "Query does not match provided commitment".to_string(),
            }),
        ));
    }

    // Check timestamp is within acceptable range (5 minutes)
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    if now.abs_diff(req.timestamp) > 300 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "timestamp_expired".to_string(),
                message: "Request timestamp is too old or in the future".to_string(),
            }),
        ));
    }

    // Call QuickNode RPC
    let account_info = state
        .rpc_client
        .get_account_info(&req.account_pubkey)
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_GATEWAY,
                Json(ErrorResponse {
                    error: "rpc_error".to_string(),
                    message: e.to_string(),
                }),
            )
        })?;

    // Generate proof
    let data_bytes = account_info
        .data
        .as_ref()
        .and_then(|d| d.first())
        .and_then(|s| BASE64.decode(s).ok())
        .unwrap_or_default();

    let proof = generate_account_proof(&req.account_pubkey, &data_bytes, account_info.slot);

    Ok(Json(PrivateAccountResponse {
        data: account_info.data.and_then(|d| d.first().cloned()),
        owner: account_info.owner,
        lamports: account_info.lamports,
        slot: account_info.slot,
        executable: account_info.executable,
        merkle_proof: proof,
        commitment: req.commitment,
        verified: true,
    }))
}

/// Public getAccountInfo request (for comparison demo)
#[derive(Debug, Deserialize)]
pub struct PublicAccountRequest {
    pub account_pubkey: String,
}

/// Public getAccountInfo response
#[derive(Debug, Serialize)]
pub struct PublicAccountResponse {
    pub data: Option<String>,
    pub owner: Option<String>,
    pub lamports: Option<u64>,
    pub slot: u64,
    pub executable: Option<bool>,
}

/// Public getAccountInfo endpoint (passthrough for demo comparison)
pub async fn get_account_info_public(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PublicAccountRequest>,
) -> Result<Json<PublicAccountResponse>, (StatusCode, Json<ErrorResponse>)> {
    let account_info = state
        .rpc_client
        .get_account_info(&req.account_pubkey)
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_GATEWAY,
                Json(ErrorResponse {
                    error: "rpc_error".to_string(),
                    message: e.to_string(),
                }),
            )
        })?;

    Ok(Json(PublicAccountResponse {
        data: account_info.data.and_then(|d| d.first().cloned()),
        owner: account_info.owner,
        lamports: account_info.lamports,
        slot: account_info.slot,
        executable: account_info.executable,
    }))
}
