package store

import (
	"fmt"
	"strings"
)

// splitSQLScript splits a migration script into individual statements.
//
// The first version of the migration runner used strings.Split(script, ";"),
// which silently broke as soon as a statement contained a semicolon inside a
// string literal or a comment. This scanner tracks string literals, quoted
// identifiers and comments so those semicolons stay inside their statement.
//
// Trigger bodies are deliberately not supported: they contain statement
// separators that cannot be told apart from the outer ones without a real SQL
// parser. A migration that defines a trigger fails loudly instead of being
// split into broken fragments.
func splitSQLScript(script string) ([]string, error) {
	var (
		statements []string
		current    strings.Builder
		inSingle   bool
		inDouble   bool
		inLine     bool
		inBlock    bool
	)

	for i := 0; i < len(script); i++ {
		character := script[i]
		switch {
		case inLine:
			current.WriteByte(character)
			if character == '\n' {
				inLine = false
			}
		case inBlock:
			current.WriteByte(character)
			if character == '*' && i+1 < len(script) && script[i+1] == '/' {
				current.WriteByte('/')
				i++
				inBlock = false
			}
		case inSingle:
			current.WriteByte(character)
			if character == '\'' {
				// A doubled quote is an escaped quote, not the end of the literal.
				if i+1 < len(script) && script[i+1] == '\'' {
					current.WriteByte('\'')
					i++
				} else {
					inSingle = false
				}
			}
		case inDouble:
			current.WriteByte(character)
			if character == '"' {
				if i+1 < len(script) && script[i+1] == '"' {
					current.WriteByte('"')
					i++
				} else {
					inDouble = false
				}
			}
		default:
			switch {
			case character == '-' && i+1 < len(script) && script[i+1] == '-':
				inLine = true
				current.WriteString("--")
				i++
			case character == '/' && i+1 < len(script) && script[i+1] == '*':
				inBlock = true
				current.WriteString("/*")
				i++
			case character == '\'':
				inSingle = true
				current.WriteByte(character)
			case character == '"':
				inDouble = true
				current.WriteByte(character)
			case character == ';':
				if statement := strings.TrimSpace(current.String()); statement != "" {
					statements = append(statements, statement)
				}
				current.Reset()
			default:
				current.WriteByte(character)
			}
		}
	}

	if inSingle || inDouble || inBlock {
		return nil, fmt.Errorf("migration script ends inside a string literal or comment")
	}
	if statement := strings.TrimSpace(current.String()); statement != "" {
		statements = append(statements, statement)
	}

	for _, statement := range statements {
		upper := strings.ToUpper(statement)
		if strings.HasPrefix(upper, "CREATE TRIGGER") || strings.HasPrefix(upper, "CREATE TEMP TRIGGER") {
			return nil, fmt.Errorf("trigger definitions are not supported in migrations")
		}
	}
	return statements, nil
}
