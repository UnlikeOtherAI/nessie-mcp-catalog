/** The refresh token may publish only these generated data paths. */
export function isGeneratedPath(path: string): boolean {
  return /^(?:inputs\/[a-z0-9-]+\/(?:snapshot\.(?:json|md)|metadata\.json)|observations\/[a-z0-9-]+\.json|licenses\/[a-z0-9-]+\.txt|dist\/(?:catalog|manifest)\.json|reports\/catalog-report\.json|state\/missing\.json|sources\.lock\.json|publication\.json)$/.test(path)
}
export function assertGeneratedPaths(paths: string[]): void {
  if (paths.some((path) => !isGeneratedPath(path))) throw new Error('Refresh changed a non-generated path')
}
