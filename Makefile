.PHONY: all build lint format format-fix typecheck test check fix docs

all: check

build:
	pnpm build

lint:
	pnpm lint

format:
	pnpm format

format-fix:
	pnpm format-fix

typecheck:
	pnpm typecheck

test:
	pnpm test

check:
	pnpm check

fix:
	pnpm format-fix
	pnpm lint -- --fix

docs:
	pnpm docs:build
