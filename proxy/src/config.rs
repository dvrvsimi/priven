use anyhow::{Context, Result};

#[derive(Clone, Debug)]
pub struct Config {
    pub quicknode_rpc_url: String,
    pub proxy_secret_key: Option<String>,
    pub enable_logging: bool,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let quicknode_rpc_url = std::env::var("QUICKNODE_RPC_URL")
            .context("QUICKNODE_RPC_URL environment variable not set")?;

        let proxy_secret_key = std::env::var("PROXY_SECRET_KEY").ok();

        let enable_logging = std::env::var("ENABLE_LOGGING")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        Ok(Self {
            quicknode_rpc_url,
            proxy_secret_key,
            enable_logging,
        })
    }
}
