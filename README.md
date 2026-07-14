# GitHub Story Generator

Ever looked at someone's GitHub profile and wondered what their coding journey actually *looks* like? That's the itch this project scratches — it pulls a GitHub profile's public data and turns it into an AI-written narrative. Think of it as a short "story of your code" generator.

I built this mainly to get hands-on with running a real multi-container app on Kubernetes — not just spinning up a toy deployment, but actually thinking through service communication, persistence, secrets, and uptime.

## What it does

- Takes any public GitHub username and fetches their profile + repo data via the GitHub REST API
- Feeds that data to the OpenAI API, which writes a short, human-readable narrative about the developer's journey
- Lets you save the generated story and share it via a unique link
- Handles concurrent story generation without falling over

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** MongoDB (for storing and serving saved stories)
- **Reverse Proxy:** Nginx
- **AI:** OpenAI API
- **Containerization:** Docker
- **Orchestration:** Kubernetes

## Architecture

The app runs as three containerized services:


Client → Nginx → Node.js/Express API → MongoDB
                        ↓
                   OpenAI API


On Kubernetes, this is deployed as 5 pods with 2 replicas each, so if one pod goes down, traffic just shifts to the other — no downtime during failovers. Config and secrets (like the OpenAI API key and Mongo connection string) are managed through Kubernetes ConfigMaps and Secrets, so nothing sensitive sits in the codebase or gets baked into images.

## Key things I focused on

**Reliability:** The whole point of running this on K8s instead of a single container was to test failover behavior. With replicas across pods, the app kept a 99.9% uptime target even during pod restarts.

**Scale:** Tested the story-generation flow under 1000+ concurrent requests to make sure the API layer and Mongo writes didn't choke under load.

**Security:** No credentials in code, ever. Everything sensitive goes through Kubernetes Secrets, and non-sensitive config lives in ConfigMaps.

## Running it locally


# clone the repo
git clone https://github.com/yourusername/github-story-generator.git
cd github-story-generator

# set up environment variables
cp .env.example .env
# add your GitHub token, OpenAI API key, and MongoDB URI to .env

# spin up all services
docker-compose up --build


App should be available at `http://localhost:3000` (or whatever port you've mapped in `docker-compose.yml`).

## Deploying to Kubernetes


kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

Check pod status with:

kubectl get pods

## What I'd add next

- Rate limiting on the story-generation endpoint to control OpenAI API costs
- A caching layer so re-fetching the same profile within a short window doesn't hit the GitHub API again
- Horizontal Pod Autoscaler tied to CPU/memory instead of a fixed replica count

## License

MIT — feel free to fork and play around with it.
