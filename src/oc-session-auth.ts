/**
 * Unified session auth for Operating Center pages (2026-10-02).
 *
 * Replaces the owner-key gate in normal UX. Pages check for a session
 * token (from /login) in sessionStorage. If absent, redirect to /login.
 * The owner key remains only as bootstrap on /admin (not in normal UX).
 *
 * Usage in page scripts:
 *   const key = getSessionKey();  // '' if not signed in
 *   if (!key) { window.location.href = '/login'; return; }
 *   // use key as Bearer token for API calls
 */

export const SESSION_STORAGE_KEY = "nwana_engine_session";
export const LEGACY_KEY_STORAGE = "nwana_operating_center_key";

export const SESSION_AUTH_SCRIPT = `
(function(){
	window.__sessionAuth = {
		getKey: function(){
			try {
				var s = sessionStorage.getItem('${SESSION_STORAGE_KEY}');
				if (s) return s;
			} catch(e){}
			// Bootstrap fallback: owner key (platform admin recovery only).
			// Normal users never see this path; they go through /login.
			try { return localStorage.getItem('${LEGACY_KEY_STORAGE}') || ''; } catch(e){ return ''; }
		},
		requireSession: function(){
			var k = this.getKey();
			if (!k) { window.location.href = '/login'; return null; }
			return k;
		},
		clear: function(){
			try { sessionStorage.removeItem('${SESSION_STORAGE_KEY}'); } catch(e){}
		},
		authHeader: function(){
			var k = this.getKey();
			return k ? { 'authorization': 'Bearer ' + k } : {};
		}
	};
})();
`;
