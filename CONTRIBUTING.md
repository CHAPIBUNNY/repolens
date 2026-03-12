# Contributing to RepoLens

First of all, thank you for taking the time to contribute to RepoLens.

RepoLens is an open source repository intelligence system designed to generate architecture documentation directly from real codebases. Contributions help make the tool more reliable, more useful, and more widely adopted across engineering teams.

This document explains how to contribute effectively.

---

# Ways to Contribute

There are several ways to contribute to RepoLens.

## Reporting Bugs

If you encounter a bug:

1. Search existing issues first to avoid duplicates.
2. If the issue does not exist, open a new issue.
3. Provide as much detail as possible.

Please include:

- RepoLens version  
- Node.js version  
- Operating system  
- Command executed  
- Error message or stack trace  
- Steps to reproduce the problem  

Clear bug reports help resolve issues quickly.

---

## Suggesting Features

Feature suggestions are welcome.

Before submitting a feature request:

- Check the roadmap in `ROADMAP.md`
- Search existing issues to see if the idea has already been discussed

When proposing a feature, include:

- The problem being solved  
- Expected behavior  
- Example usage  
- Any alternative solutions considered  

RepoLens focuses on **repository intelligence and documentation automation**, so suggestions aligned with this goal are most valuable.

---

## Improving Documentation

Documentation improvements are always appreciated.

Examples include:

- Improving the README
- Clarifying configuration examples
- Improving onboarding instructions
- Fixing typos or formatting
- Expanding usage examples

Documentation contributions are often the easiest way to start contributing.

---

# Development Setup

## 1. Clone the repository

    git clone https://github.com/CHAPIBUNNY/repolens.git
    cd repolens

## 2. Install dependencies

    npm install

## 3. Link the CLI locally

    npm link

You can now run RepoLens locally:

    repolens publish

---

# Running Tests

Before submitting a pull request, ensure tests pass.

    npm test

All tests must pass before a contribution can be merged.

---

# Pull Request Guidelines

Please follow these guidelines when submitting a pull request.

## Before Opening a Pull Request

- Ensure the feature or bug fix has an associated issue
- Ensure tests pass
- Update documentation if necessary

## Pull Request Expectations

A good pull request should:

- Have a clear and descriptive title
- Explain the motivation for the change
- Describe the implementation
- Reference related issues when applicable

Small, focused pull requests are preferred over large sweeping changes.

---

# Code Style

RepoLens aims to keep the codebase simple and maintainable.

General principles:

- Prefer clarity over cleverness
- Avoid unnecessary dependencies
- Keep modules small and focused
- Write descriptive function and variable names
- Follow the existing project structure

Consistency with the existing codebase is important.

---

# Security Issues

If you discover a security vulnerability:

**Do not open a public issue.**

Instead report it privately via email:

    trades@rabitaitrades.com

Security issues will be investigated and addressed as quickly as possible.

---

# Community Guidelines

RepoLens aims to maintain a respectful and collaborative community.

Please:

- Be respectful
- Provide constructive feedback
- Focus discussions on improving the project

Harassment, abusive language, or disrespectful behavior will not be tolerated.

---

# License

By contributing to RepoLens, you agree that your contributions will be licensed under the project's MIT License.

---

Thank you for contributing to RepoLens.
