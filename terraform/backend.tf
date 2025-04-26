terraform {
  backend "gcs" {
    bucket = "fs-ai-gul-kai-tfstate-firestarter-x"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "6.31.0"
    }
  }
}