use anyhow::Result;
use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod crypto;
mod proof;
mod routes;
mod rpc;

use config::Config;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "priven_proxy=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    dotenvy::dotenv().ok();
    let config = Config::from_env()?;

    tracing::info!("Starting Priven Proxy");
    tracing::info!("QuickNode RPC: {}", config.quicknode_rpc_url);

    // Build application state
    let state = routes::AppState::new(config);

    // Build router
    let app = Router::new()
        // Health check
        .route("/health", get(routes::health::health_check))
        // Private RPC endpoints
        .route(
            "/v1/private/getAccountInfo",
            post(routes::account::get_account_info),
        )
        .route(
            "/v1/private/getMultipleAccounts",
            post(routes::accounts::get_multiple_accounts),
        )
        .route(
            "/v1/private/simulateTransaction",
            post(routes::simulate::simulate_transaction),
        )
        // Passthrough endpoints (for comparison demo)
        .route(
            "/v1/public/getAccountInfo",
            post(routes::account::get_account_info_public),
        )
        // Add middleware
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
