use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::crypto::verify_commitment;
use crate::routes::account::ErrorResponse;
use crate::routes::AppState;

/// Private simulateTransaction request
#[derive(Debug, Deserialize)]
pub struct PrivateSimulateRequest {
    pub commitment: String,
    pub transaction: String, // Base64 encoded transaction
    pub nonce: String,
    pub timestamp: u64,
}

/// Private simulateTransaction response
#[derive(Debug, Serialize)]
pub struct PrivateSimulateResponse {
    pub err: Option<serde_json::Value>,
    pub logs: Option<Vec<String>>,
    pub units_consumed: Option<u64>,
    pub commitment: String,
    pub verified: bool,
}

pub async fn simulate_transaction(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PrivateSimulateRequest>,
) -> Result<Json<PrivateSimulateResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Verify commitment (hash of transaction)
    if !verify_commitment(&req.transaction, &req.nonce, req.timestamp, &req.commitment) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "commitment_mismatch".to_string(),
                message: "Transaction does not match provided commitment".to_string(),
            }),
        ));
    }

    // Check timestamp
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
    let simulation = state
        .rpc_client
        .simulate_transaction(&req.transaction)
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

    Ok(Json(PrivateSimulateResponse {
        err: simulation.err,
        logs: simulation.logs,
        units_consumed: simulation.units_consumed,
        commitment: req.commitment,
        verified: true,
    }))
}
