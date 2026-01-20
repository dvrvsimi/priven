use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Nonce,
};
use x25519_dalek::{PublicKey, StaticSecret};

/// Decrypt an encrypted query using X25519 + ChaCha20-Poly1305
pub fn decrypt_query(
    encrypted_query: &str,
    ephemeral_public_key: &str,
    proxy_secret_key: &StaticSecret,
) -> Result<DecryptedQuery> {
    // Decode base64 inputs
    let ciphertext = BASE64
        .decode(encrypted_query)
        .context("Invalid base64 ciphertext")?;
    let ephemeral_pk_bytes = BASE64
        .decode(ephemeral_public_key)
        .context("Invalid base64 ephemeral public key")?;

    // Parse ephemeral public key
    let ephemeral_pk_array: [u8; 32] = ephemeral_pk_bytes
        .try_into()
        .map_err(|_| anyhow::anyhow!("Invalid public key length"))?;
    let ephemeral_pk = PublicKey::from(ephemeral_pk_array);

    // Derive shared secret
    let shared_secret = proxy_secret_key.diffie_hellman(&ephemeral_pk);

    // Use shared secret as ChaCha20-Poly1305 key
    let cipher = ChaCha20Poly1305::new(shared_secret.as_bytes().into());

    // Extract nonce (first 12 bytes) and ciphertext
    if ciphertext.len() < 12 {
        anyhow::bail!("Ciphertext too short");
    }
    let (nonce_bytes, actual_ciphertext) = ciphertext.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    // Decrypt
    let plaintext = cipher
        .decrypt(nonce, actual_ciphertext)
        .map_err(|_| anyhow::anyhow!("Decryption failed"))?;

    // Parse decrypted JSON
    let query: DecryptedQuery =
        serde_json::from_slice(&plaintext).context("Invalid query JSON")?;

    Ok(query)
}

#[derive(Debug, serde::Deserialize)]
pub struct DecryptedQuery {
    pub account_pubkey: String,
    pub nonce: String,
    pub timestamp: u64,
}

/// Generate a new keypair for the proxy
pub fn generate_keypair() -> (StaticSecret, PublicKey) {
    let secret = StaticSecret::random_from_rng(rand::thread_rng());
    let public = PublicKey::from(&secret);
    (secret, public)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keypair_generation() {
        let (_secret, public) = generate_keypair();
        assert_eq!(public.as_bytes().len(), 32);
    }
}
