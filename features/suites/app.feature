Feature: app

  The app in app/: it answers every request with the request itself. Replace
  it with your own model, registering each capability here first.

  @APP-01 @build
  Scenario: The app answers every request with the request itself
    Given the model in app/src/App.lex.tex
    When prism-code check has Lean's kernel prove App.answers_with_the_request
    Then the answer to every request is that request, byte for byte
    And prism-code build replays the request hello, answered hello
