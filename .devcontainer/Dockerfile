# Start from the same Linux Universal image
FROM mcr.microsoft.com/devcontainers/base:debian

# Example: Install extra tools you need via apt
RUN apt-get update \
    && apt-get install -y \
        htop \
        tree \
        jq \
        unzip \
    && rm -rf /var/lib/apt/lists/*