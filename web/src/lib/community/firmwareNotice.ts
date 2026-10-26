import manifest from "../../../public/flash/manifest.json";

// The firmware notice's dismissal, in a cookie the server can read. Kept out
// of FirmwareNotice.tsx because that file is a client component, and the
// community layout reads these on the server: a server component importing a
// client module gets references, not these strings.

/** The release the notice is about, from the flasher manifest. */
export const FIRMWARE_NOTICE_VERSION = manifest.version;

/** Holds the version that was dismissed. The same name is the localStorage
 *  key, where dismissals were kept before the server needed to see them. */
export const FIRMWARE_NOTICE_COOKIE = "pf-firmware-notice";

/** True when the cookie (or stored value) dismisses this release. A value
 *  left by an earlier release does not: the notice asks once per version. */
export function firmwareNoticeDismissed(value: string | null | undefined): boolean {
  return value === FIRMWARE_NOTICE_VERSION;
}
