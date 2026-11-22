# Proposed passive README qualification (Template #103)

**Status: implementation candidate, not an accepted merge policy.** The responsible task owner approved *development* of this limited tier on 2026-11-22, without claiming general repository governance authority or waiving existing required checks.

## Authority and inputs

The future integrating workflow must supply full, trusted \`base.sha\` and \`head.sha\` from the GitHub pull request event, fetch both objects, check out exact \`head.sha\`, and execute the **base revision's** already-reviewed classifier. The classifier may not be read from the untrusted PR head to make a qualification decision. Workflow and classifier modifications always require full verification. Do not accept user-controlled commit IDs from PR content, unchecked artifacts, check-name spoofing, or an untrusted PR's edited workflow.

\`ci/passive_readme_scope.py\` is currently a **read-only proof of the classification algorithm**, not an independently authoritative branch-protection gate. A positive CLI result is a candidate receipt for reviewing the protocol. Nonzero results require full native acceptance; they are not failures to hide.

## Permitted passive change

Only modifications to \`README.md\` and addition/replacement of \`assets/readme-banner-PLACEHOLDER.png\` are eligible. The PNG is bound to the Foundation's approved provisional **Git blob** \`29273d499d3891ccc728f10eef601776884e639d\`; this is an identity of the illustrative asset, **not brand approval**.

The validator compares the complete trusted merge-base/head Git tree diff with renames disabled. It rejects unknown paths, file deletions, symlinks, nonregular/executable modes, missing references, an empty diff, modified generated or release-controlled README regions, unresolved local paths, and broken navigation anchors. A fully generated README is not a passive document: its source-owner must regenerate it through its locked SDK. As new generated marker syntaxes or Markdown link forms are encountered, classifier compatibility must be reviewed **without broadening qualification by default**.

## Qualification and deployment contract

1. Keep the existing universal bootstrap and \`just vv\` **required** for source, model, lock, workflow, generated documentation, and any unsupported change.
2. After independent negative-case validation, produce one always-running required **qualification** check: the trusted classifier selects docs-only verification or the real full SDK jobs. Every classified obligation is executed. A scope refusal routes to full acceptance; it does not produce a success without checking.
3. For proven passive docs, run positive lightweight checks against the actual PR head and require the final qualification to account for their success. For any other class, run full native verification and require the result. Maintain the mandatory main, tag, merge-group and publication checks unchanged.
4. Update the normative bootstrap and \`VERIFICATION.md\` only through a controlled Template revision and lock regeneration in the released PrismPM SDK. Reconcile Template #98, #102 and #109 before modifying that shared workflow.
5. Update branch protections to require the exact new qualification check only **after** the new workflow is present and tested. Test a docs-only PR where expensive jobs are skipped, a mixed/code PR where they execute, and a malicious classifier/workflow PR where full checks cannot be bypassed. Require the same protections for forks and dependency edge cases.
6. Apply the accepted Template policy to the two unbound consumer repositories, **MNIST #24** and **Calculator Example #31**, through their governed update path. Do not mint an SDK lock or template lock for an unreleased binding. The previous failing native checks remain a veto until the approved policy replaces their eligibility contract.

## Test inventory

Run \`python3 -m unittest discover -s ci -p 'test_passive_readme_scope.py' -v\`. The planted tests cover two-file acceptance and invalid/missing image bytes, mixed source, workflow and unknown file changes; executable and symlink README modes; broken anchors, local targets and path traversal; generated README headers, altered or removed protected regions; invalid base/head identity; missing README changes, renames and image-only PRs.

**Completion is evidence-based:** a successful local fixture suite is not enough. It must be followed by a trusted implementation workflow, review, exact-head integration, positive/negative consumer trials, and explicit effective branch-protection validation.
