# Configure the Google Cloud provider.
# It's a good practice to define the project and region using variables
# or environment variables for flexibility.
provider "google" {
  project = "archstats"
}


terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "7.5.0"
    }
  }
  backend "gcs" {
    bucket = "archstats-terraform-state"
    prefix = "terraform/state"
  }
}
