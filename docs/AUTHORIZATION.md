# Authorization Rules

## Product Scope

- A non-admin operator or supervisor needs an `operator_products` assignment for product-based access. A missing product ID never grants this access.
- `X-Product-Id` selects a product; it does not authorize access. Operator room creation, room listing and phone search validate this selection.
- An operator with no product assignments receives an empty room list and no phone-search results.
- Phone search returns users linked to an allowed product through a customer profile or a room. Both the user lookup and the returned active room are scoped.
- Room updates and closure require product access or the admin role.

## Membership and Realtime

- Active room membership grants room and message access, including legacy rooms without a product. Former membership does not.
- Attachment access requires upload ownership, active membership of the message's room, product access, or the admin role. The same checks protect original and thumbnail URLs.
- Centrifugo subscription tokens and the subscribe proxy apply the same room-member, call-participant and product-access rules. Unrelated staff cannot subscribe to productless resources.
- Reading call metadata or subscribing to call events does not grant access to call audio. All LiveKit token endpoints require a caller/callee identity or the admin role.

## Call Actions and Routing

- Hangup requires a caller/callee identity or the admin role, including requests for already-ended calls.
- Starting a recording requires a staff role and call participation, or the admin role. The existing recording consent flow still applies.
- Transfer initiation requires the current callee to be a staff user with product access. The target must be an active staff user with access to the same product. Self-transfers are rejected. Target access is rechecked before completing a warm transfer.
- Inbound calls require a `productId` UUID. Missing products are rejected before creating a call or a LiveKit room. The Flutter client sends this ID and no unsupported `type` field.
- Outbound operators must have access to their server-stored current product.
- Inbound routing checks the operator's product assignment, account status and current product. Queue notifications are product-scoped. Routing after hangup only selects queued calls for the operator's currently assigned product.

## Verification

From each of `services/auth`, `services/chat`, `services/call` and `services/media`:

```sh
npm ci
npm run prisma:generate
npm test -- --runInBand
npm run build
```

Regression coverage includes non-admin cross-product requests, missing product assignments, null-product resources, rejected call mutations without side effects, transfer targets, both realtime authorization paths, and original/thumbnail access.

These unit tests mock external dependencies. They do not establish end-to-end behavior of PostgreSQL queries, LiveKit, Centrifugo, recording or production infrastructure. Full integration tests require the running service stack.

Existing unscoped support rooms and calls need explicit product assignments before staff can manage or route them. Deploying these checks does not revoke previously issued realtime tokens or already connected sessions.
