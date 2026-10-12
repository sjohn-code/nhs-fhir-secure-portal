import Keycloak from "keycloak-js";

// Public client: no secret in the browser. PKCE protects the code exchange.
const keycloak = new Keycloak({
  url: "http://localhost:8081",
  realm: "nhs-portal",
  clientId: "portal-frontend",
});

export default keycloak;