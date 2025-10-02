variable "git_branches" {
    description = "List of Git branches to create"
    type        = list(string)
    default     = ["main", "develop"]
}