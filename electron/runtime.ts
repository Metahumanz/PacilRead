/** Electron Builder sets this for the Windows portable target. */
export function isPortableBuild(): boolean {
  return process.platform === 'win32' && Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
}
