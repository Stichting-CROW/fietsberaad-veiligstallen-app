FROM alpine:3.20
RUN apk add --no-cache curl ca-certificates wget \
  && arch="$(uname -m)" \
  && case "$arch" in \
       x86_64) suffix=linux-amd64 ;; \
       aarch64) suffix=linux-arm64 ;; \
       *) echo "unsupported architecture $arch" && exit 1 ;; \
     esac \
  && wget -q -O /usr/local/bin/supercronic "https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-${suffix}" \
  && chmod +x /usr/local/bin/supercronic
COPY cron-entrypoint.sh /cron-entrypoint.sh
RUN chmod +x /cron-entrypoint.sh
ENTRYPOINT ["/bin/sh", "/cron-entrypoint.sh"]
