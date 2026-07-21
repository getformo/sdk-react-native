import { getSessionId } from "../lib/event/EventFactory";
import { initStorageManager, storage } from "../lib/storage";
import {
  LOCAL_SESSION_ID_KEY,
  LOCAL_SESSION_LAST_ACTIVITY_KEY,
  SESSION_TIMEOUT_MS,
} from "../constants";

/**
 * These tests exist because a missing/empty session_id collapses every mobile
 * user of a project into a single downstream session (bounce/engagement/duration
 * all break). They pin the intended contract: one stable id per active session,
 * a fresh id after the inactivity timeout.
 */
describe("getSessionId", () => {
  beforeEach(() => {
    initStorageManager("session-test-key");
    storage().remove(LOCAL_SESSION_ID_KEY);
    storage().remove(LOCAL_SESSION_LAST_ACTIVITY_KEY);
  });

  it("mints and persists a UUID session id on first call", () => {
    const id = getSessionId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(storage().get(LOCAL_SESSION_ID_KEY)).toBe(id);
    // Every event must carry an id — the whole point of the fix.
    expect(id).not.toBe("");
  });

  it("reuses the same id for events within the inactivity window", () => {
    expect(getSessionId()).toBe(getSessionId());
  });

  it("mints a new id once the inactivity timeout has elapsed", () => {
    const first = getSessionId();
    // Simulate the previous event happening longer ago than the timeout.
    storage().set(
      LOCAL_SESSION_LAST_ACTIVITY_KEY,
      String(Date.now() - (SESSION_TIMEOUT_MS + 1))
    );
    const second = getSessionId();
    expect(second).not.toBe(first);
    expect(storage().get(LOCAL_SESSION_ID_KEY)).toBe(second);
  });

  it("refreshes the last-activity marker on every call", () => {
    getSessionId();
    const firstMarker = Number(storage().get(LOCAL_SESSION_LAST_ACTIVITY_KEY));
    // Backdate the marker, then confirm the next call moves it forward.
    storage().set(LOCAL_SESSION_LAST_ACTIVITY_KEY, String(firstMarker - 1000));
    getSessionId();
    const secondMarker = Number(storage().get(LOCAL_SESSION_LAST_ACTIVITY_KEY));
    expect(secondMarker).toBeGreaterThan(firstMarker - 1000);
  });
});
