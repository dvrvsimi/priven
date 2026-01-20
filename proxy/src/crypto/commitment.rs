use sha2::{Digest, Sha256};

/// Verify that a query matches its commitment
/// commitment = SHA256(account_pubkey || nonce || timestamp)
pub fn verify_commitment(
    account_pubkey: &str,
    nonce: &str,
    timestamp: u64,
    provided_commitment: &str,
) -> bool {
    let computed = compute_commitment(account_pubkey, nonce, timestamp);
    computed == provided_commitment
}

/// Compute commitment for a query
pub fn compute_commitment(account_pubkey: &str, nonce: &str, timestamp: u64) -> String {
    let mut hasher = Sha256::new();
    hasher.update(account_pubkey.as_bytes());
    hasher.update(nonce.as_bytes());
    hasher.update(timestamp.to_le_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_commitment_verification() {
        let pubkey = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        let nonce = "random123";
        let timestamp = 1705672485u64;

        let commitment = compute_commitment(pubkey, nonce, timestamp);
        assert!(verify_commitment(pubkey, nonce, timestamp, &commitment));

        // Wrong pubkey should fail
        assert!(!verify_commitment("wrong", nonce, timestamp, &commitment));
    }
}
