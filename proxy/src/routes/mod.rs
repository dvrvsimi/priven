pub mod account;
pub mod accounts;
pub mod health;
pub mod simulate;

use crate::config::Config;
use crate::rpc::QuickNodeClient;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub rpc_client: QuickNodeClient,
}

impl AppState {
    pub fn new(config: Config) -> Arc<Self> {
        let rpc_client = QuickNodeClient::new(config.quicknode_rpc_url.clone());
        Arc::new(Self { config, rpc_client })
    }
}
