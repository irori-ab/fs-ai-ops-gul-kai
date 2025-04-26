# --------------------------------------------------------------------------------------
# CREATE GKE CLUSTER
# --------------------------------------------------------------------------------------
resource "google_container_cluster" "main" {
  name               = "${var.cluster_name}"
  location           = var.region
  initial_node_count = 1
  remove_default_node_pool = true
  deletion_protection = false
  timeouts {
    create = "30m"
    update = "40m"
  }
}

# #--------------------------------------------------------------------------------------
# # CREATE NODE POOL
# #-------------------------------------------------------------------------------------
resource "google_container_node_pool" "node-pool" {
  # provider = google-beta

  name       = "${var.cluster_name}-node-pool"
  cluster    = var.cluster_name
  location   = var.region
  node_count = 1

  depends_on = [
    google_container_cluster.main
  ]

  autoscaling {
    min_node_count = var.min_count
    max_node_count = var.max_count
  }

  management {
    auto_repair  = "true"
    auto_upgrade = "true"
  }

  node_config {
    machine_type    = "e2-standard-2"
    disk_size_gb    = "20"
    disk_type       = "pd-standard"
    preemptible     = false
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring"
    ]
  }
}

resource "time_sleep" "wait_30_seconds" {
  depends_on = [google_container_cluster.main]
  create_duration = "30s"
}

module "gke_auth" {
  depends_on           = [time_sleep.wait_30_seconds]
  source               = "terraform-google-modules/kubernetes-engine/google//modules/auth"
  project_id           = var.project_id
  cluster_name         = var.cluster_name
  location             = var.region
  use_private_endpoint = false
}
