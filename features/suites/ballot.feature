Feature: ballot

  The template's own Prism application, in app/: it counts aye and nay ballots
  and its holo carries the Lean proof that the count loses nothing.

  @BA-01 @build
  Scenario: Every ballot is counted exactly once: ayes plus nays equals ballots cast, for every list of ballots
    Given the ballot model in app/src/Ballot.lex.tex
    When the Lean kernel checks every_ballot_counted_once during prismpm verify
    Then ayes plus nays equals ballots cast for every list of ballots
    And the tally the application returns is computed by those same three functions
