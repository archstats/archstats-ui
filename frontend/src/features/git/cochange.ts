// Co-change rows the engine got right.
//
// Until analysis revision 2, the engine's shared-commit intersection started
// from nothing: when the first component of a pair had no commits, the pair
// reported every commit of the second as shared. 51% of Sylius's component
// pairs and 60% of nopCommerce's were inflated that way. Such a row is
// recognisable -- the side without commits reads 0% -- so every reader keeps
// only pairs where both sides read above 0%. Harmless on newer snapshots.
export const TRUSTED_PAIR_SQL = "percentage_of_all_commits_pair_1 > 0 AND percentage_of_all_commits_pair_2 > 0"
