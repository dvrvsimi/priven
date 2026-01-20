use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Clone)]
pub struct QuickNodeClient {
    http_client: reqwest::Client,
    rpc_url: String,
}

impl QuickNodeClient {
    pub fn new(rpc_url: String) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            http_client,
            rpc_url,
        }
    }

    /// Get account info from QuickNode RPC
    pub async fn get_account_info(&self, pubkey: &str) -> Result<AccountInfoResponse> {
        let request = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getAccountInfo",
            "params": [
                pubkey,
                {
                    "encoding": "base64",
                    "commitment": "confirmed"
                }
            ]
        });

        let response = self
            .http_client
            .post(&self.rpc_url)
            .json(&request)
            .send()
            .await
            .context("Failed to send RPC request")?;

        let rpc_response: RpcResponse<AccountInfoResult> = response
            .json()
            .await
            .context("Failed to parse RPC response")?;

        if let Some(error) = rpc_response.error {
            anyhow::bail!("RPC error: {} - {}", error.code, error.message);
        }

        let result = rpc_response.result.context("No result in RPC response")?;

        Ok(AccountInfoResponse {
            data: result.value.as_ref().map(|v| v.data.clone()),
            owner: result.value.as_ref().map(|v| v.owner.clone()),
            lamports: result.value.as_ref().map(|v| v.lamports),
            slot: result.context.slot,
            executable: result.value.as_ref().map(|v| v.executable),
            rent_epoch: result.value.as_ref().map(|v| v.rent_epoch),
        })
    }

    /// Get multiple accounts info from QuickNode RPC
    pub async fn get_multiple_accounts(
        &self,
        pubkeys: &[String],
    ) -> Result<Vec<Option<AccountValue>>> {
        let request = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getMultipleAccounts",
            "params": [
                pubkeys,
                {
                    "encoding": "base64",
                    "commitment": "confirmed"
                }
            ]
        });

        let response = self
            .http_client
            .post(&self.rpc_url)
            .json(&request)
            .send()
            .await
            .context("Failed to send RPC request")?;

        let rpc_response: RpcResponse<MultipleAccountsResult> = response
            .json()
            .await
            .context("Failed to parse RPC response")?;

        if let Some(error) = rpc_response.error {
            anyhow::bail!("RPC error: {} - {}", error.code, error.message);
        }

        let result = rpc_response.result.context("No result in RPC response")?;
        Ok(result.value)
    }

    /// Simulate a transaction
    pub async fn simulate_transaction(&self, tx_base64: &str) -> Result<SimulationResponse> {
        let request = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "simulateTransaction",
            "params": [
                tx_base64,
                {
                    "encoding": "base64",
                    "commitment": "confirmed",
                    "replaceRecentBlockhash": true
                }
            ]
        });

        let response = self
            .http_client
            .post(&self.rpc_url)
            .json(&request)
            .send()
            .await
            .context("Failed to send RPC request")?;

        let rpc_response: RpcResponse<SimulationResult> = response
            .json()
            .await
            .context("Failed to parse RPC response")?;

        if let Some(error) = rpc_response.error {
            anyhow::bail!("RPC error: {} - {}", error.code, error.message);
        }

        let result = rpc_response.result.context("No result in RPC response")?;
        Ok(SimulationResponse {
            err: result.value.err,
            logs: result.value.logs,
            units_consumed: result.value.units_consumed,
        })
    }
}

// RPC Response types
#[derive(Debug, Deserialize)]
struct RpcResponse<T> {
    result: Option<T>,
    error: Option<RpcError>,
}

#[derive(Debug, Deserialize)]
struct RpcError {
    code: i64,
    message: String,
}

#[derive(Debug, Deserialize)]
struct AccountInfoResult {
    context: RpcContext,
    value: Option<AccountValue>,
}

#[derive(Debug, Deserialize)]
struct MultipleAccountsResult {
    context: RpcContext,
    value: Vec<Option<AccountValue>>,
}

#[derive(Debug, Deserialize)]
struct RpcContext {
    slot: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AccountValue {
    pub data: Vec<String>, // [base64_data, encoding]
    pub owner: String,
    pub lamports: u64,
    pub executable: bool,
    #[serde(rename = "rentEpoch")]
    pub rent_epoch: u64,
}

#[derive(Debug, Deserialize)]
struct SimulationResult {
    value: SimulationValue,
}

#[derive(Debug, Deserialize)]
struct SimulationValue {
    err: Option<serde_json::Value>,
    logs: Option<Vec<String>>,
    #[serde(rename = "unitsConsumed")]
    units_consumed: Option<u64>,
}

// Public response types
#[derive(Debug, Serialize)]
pub struct AccountInfoResponse {
    pub data: Option<Vec<String>>,
    pub owner: Option<String>,
    pub lamports: Option<u64>,
    pub slot: u64,
    pub executable: Option<bool>,
    pub rent_epoch: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct SimulationResponse {
    pub err: Option<serde_json::Value>,
    pub logs: Option<Vec<String>>,
    pub units_consumed: Option<u64>,
}
