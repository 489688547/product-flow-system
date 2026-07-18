const safeDecode = segment => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

export function parseAppHash(hash) {
  const path = String(hash ?? "").replace(/^#\/?/, "");
  if (!path) return { screen: "", detail: "" };

  const [screenSegment, ...detailSegments] = path.split("/");
  return {
    screen: safeDecode(screenSegment),
    detail: detailSegments.map(safeDecode).join("/")
  };
}

export function formatAppHash(screen, detail = "") {
  const screenSegment = String(screen ?? "").trim();
  if (!screenSegment) return "";

  const encodedScreen = encodeURIComponent(screenSegment);
  const detailSegments = String(detail ?? "").split("/").filter(Boolean);
  if (!detailSegments.length) return `#${encodedScreen}`;

  return `#${encodedScreen}/${detailSegments.map(segment => encodeURIComponent(segment)).join("/")}`;
}
