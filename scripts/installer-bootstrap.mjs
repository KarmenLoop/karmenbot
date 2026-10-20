// Keep the download ASCII-only; Windows PowerShell 5.1 otherwise decodes it
// using the response charset before it can set its own output encoding.
export function powershellBootstrap(script, baseUrl) {
  const payload = Buffer.from(script, 'utf8').toString('base64').replace(/.{1,100}/g, '$&\n').trim();
  return `# karmenbot installer for Windows 10 / 11: irm ${baseUrl.replace(/\/+$/, '')}/install.ps1 | iex
$KarmenbotPayload = @'
${payload}
'@
$KarmenbotInstaller = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(($KarmenbotPayload -replace '\\s', '')))
Invoke-Expression $KarmenbotInstaller
`;
}
