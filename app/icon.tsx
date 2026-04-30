import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #03191f 0%, #0f766e 100%)",
          color: "white",
          fontSize: 172,
          fontWeight: 700
        }}
      >
        Q302
      </div>
    ),
    size
  );
}
