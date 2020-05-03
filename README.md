# TestMate

[![Build Status](https://travis-ci.org/silbinarywolf/testmate.svg?branch=master)](https://travis-ci.org/silbinarywolf/testmate)

*WARNING: This is not ready for personal/production testing or use. This is an experimental project for the time-being. The name will likely change due to being already taken on the NPM registry.*

![Picture of test running](https://user-images.githubusercontent.com/3859574/80910954-811c6300-8d76-11ea-9f38-473b8db62245.png)

## Introduction

A test-runner with first-class support for TypeScript that strives to work with your monolithic codebase. Your code just runs in a browser and can be interacted with rapidly by leveraging your compilers "watch" functionality.

The reasons for doing this are as follows:

- Managing a seperate special compile configuration for Jest is tedious, annoying and error-prone.
- Opens the possibility of users testing styling correctness and measure element sizes, because it builds your whole project like you would when developing, things just-work as you expect.
- Most runners I looked into using that leverage the browser are slow to use because they generally have no live-watching mode and do a slow/full production build.

## Install

Not currently available on NPM as this is an experimental work-in-progress.

## Documentation

* [TODO: Quick Start](docs/en/quick-start.md)
* [TODO: Advanced Usage](docs/en/advanced-usage.md)
* [License](LICENSE.md)
* [TODO: Contributing](CONTRIBUTING.md)
