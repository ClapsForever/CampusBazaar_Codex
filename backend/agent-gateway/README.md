# CampusBazaar Agent Gateway (development only)

This small Node.js gateway adapts the Harmony app to the documented internal API of [`pi-campus-market-agent`](https://github.com/ClapsForever/pi-campus-market-agent). The app calls one stable endpoint, `POST /api/agent/chat`; the gateway calls upstream `POST /internal/agent/chat` and injects the Agent service token plus trusted demo user/school headers.

The gateway does not copy or vendor the upstream repository. Run that repository separately in its documented mock mode, then run this adapter. Both services can be replaced independently later.

## Important safety boundary

This is only a local-development bridge. The current CampusBazaar login is Mock, so the gateway uses a configured demo identity and a development-only client token. Do not expose this gateway to the public Internet or use it in a production app. A production deployment must sit behind the authenticated business backend, which derives user/school identity from the login session and keeps the Agent service token server-side.

The token configured in `AGENT_SERVICE_TOKEN` is private to the gateway and upstream Agent process. `DEV_CLIENT_TOKEN` is a separate local gate and is visible in a development app build; it is not a production credential.

## Run

1. Start `pi-campus-market-agent` in its documented mock configuration. Keep its internal service token in that server's environment and note the value; the upstream default port is `3000`.
2. In this directory, copy `.env.example` to `.env`. Set `AGENT_SERVICE_TOKEN` to the same value used by the Agent process. Set `DEV_CLIENT_TOKEN` to a random development-only value.
3. Start the gateway with Node.js 22.19 or later:

   ```powershell
   npm start
   ```

4. Check `GET http://127.0.0.1:3180/health` from the development computer.
5. In `entry/src/main/ets/service/AgentRuntimeConfig.ets`, set `AGENT_BACKEND_MODE` to `AgentBackendMode.REMOTE`, set `AGENT_GATEWAY_BASE_URL` to an address reachable by the simulator, and set `AGENT_GATEWAY_DEV_TOKEN` to the same development token. Use the development computer's LAN address when loopback is not reachable from the simulator. If the gateway must listen beyond loopback, set `HOST=0.0.0.0` only on a trusted private network and stop it when finished.
6. Rebuild and install the app. The app sends only `requestId`, `sessionId`, and `message`; it never sends a user ID, school ID, or Agent service token.

The app keeps Agent sessions in its `AgentViewModel` and reuses the returned `sessionId`. In Mock mode, recommendation items resolve to local Product cards. The upstream Agent response currently contains listing IDs and reasons only; remote mode displays those values without inventing product details. Clickable remote product cards should be enabled once a trusted business listing-detail API is available.

## Contract

`POST /api/agent/chat` accepts:

```json
{
  "requestId": "cb_123_1",
  "sessionId": null,
  "message": "50 元以内的高数教材"
}
```

Success responses match upstream `AgentResponse` (`requestId`, `sessionId`, `status`, `reply`, `recommendations`, `relaxedConditions`). Errors use `{ requestId, code, message, retryable }`. The gateway does not turn service errors into empty search results.

Run the gateway contract tests with `npm test`.
