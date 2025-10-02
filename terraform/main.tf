# Create a Google Cloud Storage bucket.
resource "google_storage_bucket" "static_bucket" {
  # The name of the bucket. GCS bucket names must be globally unique.
  name = "archstats-static-files"

  # The location of the bucket.
  # For example: "US" (multi-region), "US-CENTRAL1" (region), "US-CENTRAL1-A" (dual-region).
  location = "europe-west4"

  # This setting enables uniform access control for all objects in the bucket.
  # It's a recommended security best practice.
  uniform_bucket_level_access = true

  # WARNING: Setting force_destroy to "true" will allow Terraform to delete
  # the bucket even if it contains objects. This is useful for development
  # but should be used with caution in production environments.
  force_destroy = true
}


# Create a backend bucket service for the static content.
# This allows the GCS bucket to be used as a backend for the load balancer.
resource "google_compute_backend_bucket" "static_backend" {
  name        = "static-bucket-backend"
  description = "Backend service for the static files bucket"
  bucket_name = google_storage_bucket.static_bucket.name
  enable_cdn  = true
}


# Create the URL map to route incoming requests.
resource "google_compute_url_map" "urlmap" {
  name            = "static-content-url-map"
  default_service = google_compute_backend_bucket.static_backend.id

  # Dynamically create host rules for each branch in the git_branches variable.
  dynamic "host_rule" {
    for_each = toset(var.git_branches)
    content {
      hosts = ["${host_rule.value}.archstats.dev"]
      path_matcher = "${host_rule.value}-matcher"
    }
  }

  # Dynamically create path matchers that correspond to each host rule.
  # This rewrites the URL to point to the correct subfolder in the GCS bucket.
  dynamic "path_matcher" {
    for_each = toset(var.git_branches)
    content {
      name            = "${path_matcher.value}-matcher"
      default_service = google_compute_backend_bucket.static_backend.id

      path_rule {
        paths = ["/*"]
        service = google_compute_backend_bucket.static_backend.id
        route_action {
          url_rewrite {
            path_prefix_rewrite = "/${path_matcher.value}/"
          }
        }
      }
    }
  }
}

# --- Load Balancer Frontend ---

# Reserve a static global IP address for the load balancer.
resource "google_compute_global_address" "lb_ip" {
  name = "static-content-lb-ip"
}

# Create a Google-managed SSL certificate for the domains.
resource "google_compute_managed_ssl_certificate" "static_cert" {
  name = "static-content-cert"
  managed {
    domains = [for branch in var.git_branches : "${branch}.archstats.dev"]
  }
}
#
# Create the Target HTTPS Proxy to route requests from the forwarding rule to the URL map.
resource "google_compute_target_https_proxy" "https_proxy" {
  name    = "static-content-https-proxy"
  url_map = google_compute_url_map.urlmap.id
  ssl_certificates = [google_compute_managed_ssl_certificate.static_cert.id]
}

# # Create the Global Forwarding Rule to route incoming requests to the proxy.
resource "google_compute_global_forwarding_rule" "forwarding_rule" {
  name        = "static-content-forwarding-rule"
  ip_protocol = "TCP"
  port_range  = "443"
  target      = google_compute_target_https_proxy.https_proxy.id
  ip_address  = google_compute_global_address.lb_ip.address
}
