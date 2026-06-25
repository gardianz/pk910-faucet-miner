# Manual validation: captchaBrowser

Requires: funded multibot balance, a clean IP (or the wallet proxy), one throwaway address.

1. Set MULTIBOT_APIKEY + WALLET_1_ADDR in `.env`.
2. Run: `node -e "import('./src/captchaBrowser.mjs').then(async m=>{const {CaptchaSolver}=await import('./src/captchaSolver.mjs');const s=new CaptchaSolver(process.env.MULTIBOT_APIKEY);const r=await m.startSessionViaBrowser({faucetUrl:'https://sepolia-faucet.pk910.de',addr:process.env.WALLET_1_ADDR,solver:s,headless:false});console.log(r.session, r.modules?.pow?.preImage?'has-preimage':'no-preimage');})"`
3. Expect: a session id is printed and `has-preimage`.
4. If provider detection fails, run with `headless:false`, inspect the rendered widget, and extend `detectProvider`/`injectToken` selectors for the provider actually shown. Record which provider the faucet currently serves.
