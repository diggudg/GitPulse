//! Diff payload sizing.
//!
//! Single responsibility: decide whether a diff is small enough to travel inline
//! over the IPC bridge, or large enough that it must be streamed to disk and
//! served via the asset protocol (keeping multi-megabyte patches off the JSON
//! bridge). The command handler orchestrates; this module owns the IO decision.

use serde::Serialize;
use std::io::Write;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DiffPayload {
    Inline { text: String },
    Asset { url: String, bytes: usize },
}

/// Directory under the OS temp dir where large diffs are spilled. Mirrored by the
/// asset-protocol scope in `tauri.conf.json` (`$TEMP/gitpulse-diffs/**`).
fn spill_dir() -> PathBuf {
    std::env::temp_dir().join("gitpulse-diffs")
}

/// Return `text` inline when within `inline_limit`, otherwise spill it to a file
/// and return its path for the frontend to load via `convertFileSrc`.
pub fn build_diff_payload(
    text: String,
    sha: &str,
    file: &str,
    inline_limit: usize,
) -> std::io::Result<DiffPayload> {
    if text.len() <= inline_limit {
        return Ok(DiffPayload::Inline { text });
    }
    let dir = spill_dir();
    std::fs::create_dir_all(&dir)?;
    let safe = file.replace(['/', '\\'], "_");
    let out = dir.join(format!("{sha}-{safe}.diff"));
    let bytes = text.len();
    let mut f = std::fs::File::create(&out)?;
    f.write_all(text.as_bytes())?;
    Ok(DiffPayload::Asset {
        url: out.to_string_lossy().to_string(),
        bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_diff_stays_inline() {
        let p = build_diff_payload("tiny".into(), "abc", "a.txt", 1024).unwrap();
        assert!(matches!(p, DiffPayload::Inline { .. }));
    }

    #[test]
    fn large_diff_spills_to_disk() {
        let big = "x".repeat(2048);
        let p = build_diff_payload(big.clone(), "abc", "dir/a.txt", 1024).unwrap();
        match p {
            DiffPayload::Asset { url, bytes } => {
                assert_eq!(bytes, big.len());
                assert_eq!(std::fs::read_to_string(&url).unwrap(), big);
                let _ = std::fs::remove_file(&url);
            }
            _ => panic!("expected asset payload"),
        }
    }
}
