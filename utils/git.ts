

export type {GitCommit}

type GitCommit = {
    commit_hash: string,
    commit_time: string,
    commit_message: string,
    author_name: string,
    author_email: string,
    files_changed: number,
    additions: number,
    deletions: number
}