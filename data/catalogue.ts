export type CatalogueApp = {
  name: string;
  repoFullName: string;
  description: string;
  category: "media" | "identity" | "monitoring" | "infrastructure" | "documents";
  packageNames: string[];
};

export const catalogueApps: CatalogueApp[] = [
  { name: "Immich", repoFullName: "immich-app/immich", description: "Self-hosted photo and video management", category: "media", packageNames: ["immich"] },
  { name: "Jellyfin", repoFullName: "jellyfin/jellyfin", description: "Free software media system", category: "media", packageNames: ["jellyfin"] },
  { name: "Paperless-ngx", repoFullName: "paperless-ngx/paperless-ngx", description: "Document management system", category: "documents", packageNames: ["paperless-ngx", "paperless"] },
  { name: "Homepage", repoFullName: "gethomepage/homepage", description: "Highly customizable application dashboard", category: "infrastructure", packageNames: ["homepage"] },
  { name: "Authentik", repoFullName: "goauthentik/authentik", description: "Identity provider and SSO", category: "identity", packageNames: ["authentik"] },
  { name: "Uptime Kuma", repoFullName: "louislam/uptime-kuma", description: "Self-hosted monitoring tool", category: "monitoring", packageNames: ["uptime-kuma", "uptimekuma"] },
  { name: "Vaultwarden", repoFullName: "dani-garcia/vaultwarden", description: "Alternative Bitwarden server implementation", category: "identity", packageNames: ["vaultwarden"] },
  { name: "Portainer", repoFullName: "portainer/portainer", description: "Container management UI", category: "infrastructure", packageNames: ["portainer"] },
  { name: "Nginx Proxy Manager", repoFullName: "NginxProxyManager/nginx-proxy-manager", description: "Proxy host management UI", category: "infrastructure", packageNames: ["nginx-proxy-manager"] },
  { name: "Grafana", repoFullName: "grafana/grafana", description: "Observability dashboards", category: "monitoring", packageNames: ["grafana"] },
  { name: "Prometheus", repoFullName: "prometheus/prometheus", description: "Monitoring and alerting toolkit", category: "monitoring", packageNames: ["prometheus"] },
  { name: "Sonarr", repoFullName: "Sonarr/Sonarr", description: "TV collection manager", category: "media", packageNames: ["sonarr"] },
  { name: "Radarr", repoFullName: "Radarr/Radarr", description: "Movie collection manager", category: "media", packageNames: ["radarr"] },
  { name: "Lidarr", repoFullName: "Lidarr/Lidarr", description: "Music collection manager", category: "media", packageNames: ["lidarr"] },
  { name: "Bazarr", repoFullName: "morpheus65535/bazarr", description: "Subtitle manager", category: "media", packageNames: ["bazarr"] },
  { name: "Jellyseerr", repoFullName: "Fallenbagel/jellyseerr", description: "Media request management", category: "media", packageNames: ["jellyseerr"] },
  { name: "Overseerr", repoFullName: "sct/overseerr", description: "Media request management", category: "media", packageNames: ["overseerr"] },
  { name: "OpenCode", repoFullName: "anomalyco/opencode", description: "The open source coding agent", category: "infrastructure", packageNames: ["opencode"] },
  {
    name: "Paseo",
    repoFullName: "getpaseo/paseo",
    description: "Orchestrate multiple coding agents from desktop and mobile",
    category: "infrastructure",
    packageNames: ["paseo", "getpaseo/cli"],
  },
];
