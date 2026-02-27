type BasicCredentials = {
  username: string;
  password: string;
};

function safeEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;

  for (let i = 0; i < maxLength; i += 1) {
    const aCode = a.charCodeAt(i) || 0;
    const bCode = b.charCodeAt(i) || 0;
    mismatch |= aCode ^ bCode;
  }

  return mismatch === 0;
}

export function parseBasicAuthorizationHeader(authorizationHeader: string | null): BasicCredentials | null {
  if (!authorizationHeader || !authorizationHeader.startsWith("Basic ")) {
    return null;
  }

  const encodedCredentials = authorizationHeader.slice("Basic ".length).trim();
  if (!encodedCredentials) {
    return null;
  }

  let decodedCredentials = "";
  try {
    decodedCredentials = atob(encodedCredentials);
  } catch {
    return null;
  }

  const separatorIndex = decodedCredentials.indexOf(":");
  if (separatorIndex < 0) {
    return null;
  }

  return {
    username: decodedCredentials.slice(0, separatorIndex),
    password: decodedCredentials.slice(separatorIndex + 1),
  };
}

export function isValidBasicAuth({
  authorizationHeader,
  expectedUsername,
  expectedPassword,
}: {
  authorizationHeader: string | null;
  expectedUsername: string;
  expectedPassword: string;
}): boolean {
  const providedCredentials = parseBasicAuthorizationHeader(authorizationHeader);
  if (!providedCredentials) {
    return false;
  }

  return (
    safeEqual(providedCredentials.username, expectedUsername) &&
    safeEqual(providedCredentials.password, expectedPassword)
  );
}
