terraform {
  required_version = ">= 0.13.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "6.31.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "6.31.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "2.36.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "3.0.0-pre2"
    }

    kubectl = {
      source  = "gavinbunney/kubectl"
      version = "1.19.0"
    }
  }
}

provider "google" {
  # credentials = var.gcp_credentials
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  credentials = var.gcp_credentials
  project     = var.project_id
  region      = var.region
}

provider "kubectl" {
  host                   = module.gke_auth.host
  cluster_ca_certificate = module.gke_auth.cluster_ca_certificate
  token                  = module.gke_auth.token
  load_config_file       = false
}

# ---------
# For GKE
# ---------
data "google_client_config" "default" {}

provider "kubernetes" {
  host                   = "https://${module.gke_cluster.endpoint}"
  token                  = data.google_client_config.default.access_token
  cluster_ca_certificate = base64decode(module.gke_cluster.ca_certificate)
}

provider "helm" {
  kubernetes {
    host                   = "https://${module.gke_cluster.endpoint}"
    token                  = data.google_client_config.default.access_token
    cluster_ca_certificate = base64decode(module.gke_cluster.ca_certificate)
  }
}


#------------
# FOR ARGOCD
#------------

data "kubectl_file_documents" "namespace-argocd" {
  content = file("../manifests/argocd/namespace.yaml")
}

data "kubectl_file_documents" "argocd" {
  content = file("../manifests/argocd/crds.yaml")
}

data "kubectl_file_documents" "fs-ai-gul" {
  content = file("../manifests/argocd/config.yaml")
}

resource "kubectl_manifest" "namespace-argocd" {
  count              = length(data.kubectl_file_documents.namespace-argocd.documents)
  yaml_body          = element(data.kubectl_file_documents.namespace-argocd.documents, count.index)
  override_namespace = "argocd"
}

resource "kubectl_manifest" "argocd" {
  depends_on = [
    kubectl_manifest.namespace-argocd,
  ]
  count              = length(data.kubectl_file_documents.argocd.documents)
  yaml_body          = element(data.kubectl_file_documents.argocd.documents, count.index)
  override_namespace = "argocd"
}

#------------
# FOR STRIMZI
#------------

data "kubectl_file_documents" "namespace-kafka" {
  content = file("../manifests/strimzi/namespace.yaml")
}

data "kubectl_file_documents" "strimzi" {
  content = file("../manifests/strimzi/crds.yaml")
}

resource "kubectl_manifest" "namespace-kafka" {
  count              = length(data.kubectl_file_documents.namespace-kafka.documents)
  yaml_body          = element(data.kubectl_file_documents.namespace-kafka.documents, count.index)
  override_namespace = "kafka"
}

resource "kubectl_manifest" "strimzi" {
  depends_on = [
    kubectl_manifest.namespace-kafka,
  ]
  count              = length(data.kubectl_file_documents.strimzi.documents)
  yaml_body          = element(data.kubectl_file_documents.strimzi.documents, count.index)
  override_namespace = "kafka"
}


resource "kubectl_manifest" "fs-ai-gul" {
  depends_on = [
    kubectl_manifest.argocd,
  ]
  count              = length(data.kubectl_file_documents.fs-ai-gul.documents)
  yaml_body          = element(data.kubectl_file_documents.fs-ai-gul.documents, count.index)
  override_namespace = "argocd"
}
