use serde::Serialize;
use sha2::{Digest, Sha256};

/// Simple Merkle proof structure
/// In production, this would integrate with Light Protocol
#[derive(Debug, Clone, Serialize)]
pub struct MerkleProof {
    pub root: String,
    pub path: Vec<String>,
    pub leaf_index: u64,
    pub leaf_hash: String,
}

/// Generate a simple proof for account data
/// This is a placeholder - in production, integrate with Light Protocol
pub fn generate_account_proof(
    account_pubkey: &str,
    account_data: &[u8],
    slot: u64,
) -> MerkleProof {
    // Hash the account data
    let mut hasher = Sha256::new();
    hasher.update(account_pubkey.as_bytes());
    hasher.update(account_data);
    hasher.update(slot.to_le_bytes());
    let leaf_hash = hex::encode(hasher.finalize());

    // For MVP, create a simple single-path proof
    // In production, this would be a proper Merkle tree from Light Protocol
    let mut hasher = Sha256::new();
    hasher.update(leaf_hash.as_bytes());
    hasher.update(slot.to_le_bytes());
    let root = hex::encode(hasher.finalize());

    MerkleProof {
        root,
        path: vec![], // Empty for single-leaf tree
        leaf_index: 0,
        leaf_hash,
    }
}

/// Verify a Merkle proof (client-side)
pub fn verify_proof(
    proof: &MerkleProof,
    account_pubkey: &str,
    account_data: &[u8],
    slot: u64,
) -> bool {
    // Recompute leaf hash
    let mut hasher = Sha256::new();
    hasher.update(account_pubkey.as_bytes());
    hasher.update(account_data);
    hasher.update(slot.to_le_bytes());
    let computed_leaf = hex::encode(hasher.finalize());

    if computed_leaf != proof.leaf_hash {
        return false;
    }

    // For MVP single-leaf tree, just verify root
    if proof.path.is_empty() {
        let mut hasher = Sha256::new();
        hasher.update(proof.leaf_hash.as_bytes());
        hasher.update(slot.to_le_bytes());
        let computed_root = hex::encode(hasher.finalize());
        return computed_root == proof.root;
    }

    // Full Merkle path verification would go here
    // For production: integrate Light Protocol's verification
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proof_generation_and_verification() {
        let pubkey = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        let data = b"test account data";
        let slot = 12345u64;

        let proof = generate_account_proof(pubkey, data, slot);
        assert!(verify_proof(&proof, pubkey, data, slot));

        // Wrong data should fail
        assert!(!verify_proof(&proof, pubkey, b"wrong data", slot));
    }
}
