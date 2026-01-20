use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::proof::generate_account_proof;
use crate::routes::account::ErrorResponse;
use crate::routes::AppState;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

/// Private getMultipleAccounts request
#[derive(Debug, Deserialize)]
pub struct PrivateMultipleAccountsRequest {
    pub commitment: String,
    pub account_pubkeys: Vec<String>,
    pub nonce: String,
    pub timestamp: u64,
}

/// Account with proof
#[derive(Debug, Serialize)]
pub struct AccountWithProof {
    pub pubkey: String,
    pub data: Option<String>,
    pub owner: Option<String>,
    pub lamports: Option<u64>,
    pub executable: Option<bool>,
    pub merkle_proof: crate::proof::MerkleProof,
}

/// Private getMultipleAccounts response
#[derive(Debug, Serialize)]
pub struct PrivateMultipleAccountsResponse {
    pub accounts: Vec<Option<AccountWithProof>>,
    pub slot: u64,
    pub commitment: String,
}

pub async fn get_multiple_accounts(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PrivateMultipleAccountsRequest>,
) -> Result<Json<PrivateMultipleAccountsResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Verify commitment (hash of all pubkeys concatenated)
    let pubkeys_concat = req.account_pubkeys.join(",");
    let expected_commitment = crate::crypto::compute_commitment(&pubkeys_concat, &req.nonce, req.timestamp);
    
    if expected_commitment != req.commitment {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "commitment_mismatch".to_string(),
                message: "Query does not match provided commitment".to_string(),
            }),
        ));
    }

    // Call QuickNode RPC
    let accounts = state
        .rpc_client
        .get_multiple_accounts(&req.account_pubkeys)
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

    // Get slot from first account or use 0
    let slot = 0u64; // Would get from RPC response context

    // Generate proofs for each account
    let accounts_with_proofs: Vec<Option<AccountWithProof>> = accounts
        .into_iter()
        .zip(req.account_pubkeys.iter())
        .map(|(acc, pubkey)| {
            acc.map(|a| {
                let data_bytes = a
                    .data
                    .first()
                    .and_then(|s| BASE64.decode(s).ok())
                    .unwrap_or_default();

                let proof = generate_account_proof(pubkey, &data_bytes, slot);

                AccountWithProof {
                    pubkey: pubkey.clone(),
                    data: a.data.first().cloned(),
                    owner: Some(a.owner),
                    lamports: Some(a.lamports),
                    executable: Some(a.executable),
                    merkle_proof: proof,
                }
            })
        })
        .collect();

    Ok(Json(PrivateMultipleAccountsResponse {
        accounts: accounts_with_proofs,
        slot,
        commitment: req.commitment,
    }))
}
