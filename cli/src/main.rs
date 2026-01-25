use clap::{Parser, Subcommand};
use anyhow::Result;

#[derive(Parser)]
#[command(name = "priven")]
#[command(about = "Private Query Protocol for Solana", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Submit a private query to find matching pools
    Query {
        /// QuickNode RPC URL
        #[arg(long)]
        rpc_url: String,

        /// Minimum TVL threshold (in lamports)
        #[arg(long)]
        min_tvl: u64,

        /// Maximum TVL threshold (in lamports)
        #[arg(long)]
        max_tvl: u64,

        /// Deployed Priven program ID
        #[arg(long)]
        program_id: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Query {
            rpc_url,
            min_tvl,
            max_tvl,
            program_id,
        } => {
            println!("Priven - Private Query Protocol");
            println!("RPC: {}", rpc_url);
            println!("Query: TVL between {} and {}", min_tvl, max_tvl);
            println!("Program: {}", program_id);
            println!("\nImplementation coming soon...");

            // TODO: Implement query submission
            // 1. Fetch pools from QuickNode
            // 2. Encrypt predicate
            // 3. Create temp account with pool data
            // 4. Submit transaction
            // 5. Wait for MPC result
            // 6. Decrypt and display results
        }
    }

    Ok(())
}
