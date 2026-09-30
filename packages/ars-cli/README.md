# ars-cli

ARS command line client.

First-stage scope:

- remote management through `~/.ars/config.toml`
- browser login
- API Key import through `--api-key`
- `whoami`, `status`, and `logout`
- server discovery and compatibility check for ARS `>=0.7.1`
- `ars chat` for a temporary local browser chat with streamed Agent output; `/state` reads thread state and `/approve` resumes a pending tool approval
- `ars kb upload` for knowledge base file uploads
- `ars agent eval` for running existing Langfuse dataset experiments with a logged-in remote
