//! Product-neutral URL scheme: a deep link may only restore the running app.

const SCHEME_PREFIX: &str = __SCHEME_PREFIX__;
const RESTORE: &str = "restore";

pub fn is_supported_url(raw: &str) -> bool {
    raw.len() == SCHEME_PREFIX.len() + RESTORE.len()
        && !raw.chars().any(char::is_control)
        && raw
            .get(..SCHEME_PREFIX.len())
            .is_some_and(|scheme| scheme.eq_ignore_ascii_case(SCHEME_PREFIX))
        && raw
            .get(SCHEME_PREFIX.len()..)
            .is_some_and(|route| route.eq_ignore_ascii_case(RESTORE))
}

#[cfg(test)]
mod tests {
    use super::is_supported_url;

    #[test]
    fn only_restore_is_allowed() {
        let prefix = super::SCHEME_PREFIX;
        assert!(is_supported_url(&format!("{prefix}restore")));
        assert!(!is_supported_url(&format!("{prefix}other")));
        assert!(!is_supported_url(&format!("{prefix}restore?x=1")));
        assert!(!is_supported_url(&format!("{prefix}restore\n")));
        assert!(!is_supported_url("https://example.invalid"));
    }
}
