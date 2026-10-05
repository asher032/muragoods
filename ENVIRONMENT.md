# Environment variables

Every value below is read from the process environment at runtime. **Never put
a real secret in source code or in a committed file.** Set them in the hosting
provider's dashboard (Vercel for the site, Render for the bot) and in your
local `.env.local`, which is git-ignored.

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `DISCORD_CLIENT_ID` | Site | **Yes** | Discord OAuth application id |
| `DISCORD_CLIENT_SECRET` | Site | **Yes** | Discord OAuth client secret |
| `DISCORD_REDIRECT_URI` | Site | Production | Pins the OAuth callback URL |
| `DISCORD_TOKEN` | Bot | **Yes** | Bot login token |
| `DISCORD_PUBLIC_KEY` | Bot | **Yes** | Verifies Discord interactions |
| `DISCORD_BRIDGE_SECRET` | Both | Yes | Signs site↔bot bridge calls |
| `MONGO_URI` | Both | **Yes** | Database connection string |
| `MONGO_DB` | Bot | Yes | Database name |
| `AUTH_SECRET` | Site | **Yes** | HMAC key for the shop session cookie |
| `TMDB_API_KEY` | Site | Optional | Catalog metadata; falls back to the baked-in sample |
| `MUX_TOKEN_ID` | Site | Optional | Mux API access id |
| `MUX_TOKEN_SECRET` | Site | Optional | Mux API secret key |
| `MUX_SIGNING_KEY_ID` | Site | Optional | Mux signed-playback key id |
| `MUX_SIGNING_PRIVATE_KEY` | Site | Optional | Mux signing key (PEM or base64 PEM) |

## `invalid_client`

```
Discord token exchange failed (HTTP 401): {"error":"invalid_client"}
```

Discord is rejecting our **client id / client secret pair**. It is a
deployment misconfiguration, not a user login failure. In order of likelihood:

1. The id and the secret come from **different Discord applications**. The
   secret is rotated whenever the client secret is reset, so a regenerated
   secret paired with a stale id produces exactly this.
2. **Whitespace survived the paste.** Values are now trimmed on read, but a
   pasted value that picked up a stray newline is still worth replacing.
3. The value was never saved to the deployment and the old one is still live.
   Setting an environment variable does not restart a running bot service —
   redeploy after changing it.

The callback detects this and carries a structured internal code,
`DISCORD_OAUTH_INVALID_CLIENT`, in the redirect as `auth_error_code`. Two
messages come out of it:

- **Server log** (safe fields only, never the secret/code/token):
  `oauth_provider=discord client_id_present=… client_secret_present=…
  redirect_uri_configured=… redirect_uri_match=… token_exchange_status=401
  discord_error=invalid_client`
- **What the visitor sees** — deliberately neutral, because their Discord
  account is not what is wrong:

  > Discord connection is temporarily unavailable. Please try again later.

The operator-facing detail is kept server-side:

> Discord OAuth client credentials are invalid. Verify DISCORD_CLIENT_ID and
> DISCORD_CLIENT_SECRET belong to the same Discord application, then redeploy.

## Redirect URI consistency

Discord requires the `redirect_uri` sent during **authorization** to match the
one sent during the **token exchange** exactly.

There is exactly one definition, in `app/api/auth/discord/route.ts`:

```ts
export function getRedirectUri(req: NextRequest): string {
  const configured = process.env.DISCORD_REDIRECT_URI?.trim();
  if (configured) return configured;
  return new URL('/api/auth/discord/callback', req.nextUrl.origin).toString();
}
```

- `/api/auth/discord` (login) calls it to build the authorize URL.
- `/api/auth/discord/install` imports it rather than repeating the logic.
- `/api/auth/discord/callback` imports it for the token exchange.

Set `DISCORD_REDIRECT_URI` in production and register that same string in the
Discord portal under **OAuth2 → Redirects**. Leave it unset locally and in
preview deployments, where deriving it from the request origin is correct.

## Both sides, one database

`discord-bot/scripts/test_db_architecture.py` fails the build if the site and
the bot resolve different clusters or if a credential-shaped URI appears in a
source file. Set the same `MONGO_URI` on both.