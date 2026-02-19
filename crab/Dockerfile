FROM rust:alpine AS builder
WORKDIR /usr/src/crab
RUN apk add --no-cache musl-dev openssl-dev openssl-libs-static
COPY Cargo.toml ./
COPY src ./src
RUN RUSTFLAGS="-C target-feature=+crt-static" cargo build --release --target x86_64-unknown-linux-musl

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/src/crab/target/x86_64-unknown-linux-musl/release/hermit-crab /usr/local/bin/crab
CMD ["crab"]
