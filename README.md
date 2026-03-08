# Second Brain Dashboard

A personal knowledge management dashboard for capturing meeting notes and tracking action items — inspired by Tiago Forte's "Building a Second Brain" methodology.

![React](https://img.shields.io/badge/React-18-blue) ![Vite](https://img.shields.io/badge/Vite-5-purple)

## Features

### Note Intake
- **Paste** raw meeting notes, Slack messages, or any text
- - **File upload** with drag-and-drop support (.txt, .md files)
  - - **Auto-tagging** by source type (meeting, slack, upload)
   
    - ### Intelligent Content Cleaning (9-Phase Pipeline)
    - Not just formatting — actual content-level cleanup:
   
    - 1. **Unicode & encoding normalization**
      2. 2. **Platform noise removal** — Slack system messages, Zoom/Teams artifacts
         3. 3. **Conversational filler stripping** — greetings, sign-offs, filler phrases
            4. 4. **Language tightening** — 30+ wordy-to-concise substitutions
               5. 5. **Deduplication** — removes repeated lines
                  6. 6. **Structure normalization** — consistent bullets, header detection
                     7. 7. **Smart classification** — extracts TODOs, decisions, follow-ups
                        8. 8. **Content restructuring** — gathers decisions and actions into sections
                           9. 9. **Final cleanup** — whitespace normalization, bullet capitalization
                             
                              10. ### Action Item Tracking
                              11. - **Kanban board** with Todo / In Progress / Done columns
                                  - - **Drag-and-drop** between columns
                                    - - Action items auto-extracted from notes
                                     
                                      - ### Search & Organization
                                      - - **Full-text search** across all notes
                                        - - **Tag-based filtering** with visual tag chips
                                          - - **Sort** by date, title, or source
                                            - - **Archive** notes without permanently deleting
                                             
                                              - ### Productivity
                                              - - **Keyboard shortcuts** — Ctrl+N, Ctrl+K, Ctrl+E, and more
                                                - - **JSON export/import** for data backup and portability
                                                  - - **Responsive layout** with collapsible sidebar
                                                   
                                                    - ## Getting Started
                                                   
                                                    - ```bash
                                                      npm install
                                                      npm run dev
                                                      ```

                                                      The app runs at `http://localhost:3000` by default.

                                                      ## Tech Stack

                                                      - **React 18** — UI framework
                                                      - - **Vite** — Build tool and dev server
                                                        - - **No external UI libraries** — custom styled components
                                                         
                                                          - ## Keyboard Shortcuts
                                                         
                                                          - | Shortcut | Action |
                                                          - |----------|--------|
                                                          - | `Ctrl+N` | New note intake |
                                                          - | `Ctrl+K` | Focus search |
                                                          - | `Ctrl+1` | Go to Dashboard |
                                                          - | `Ctrl+2` | Go to Notes |
                                                          - | `Ctrl+3` | Go to Kanban |
                                                          - | `Ctrl+E` | Export data |
                                                          - | `Ctrl+I` | Import data |
                                                          - | `Escape` | Back / Close modal |
                                                          - | `?` | Show shortcuts help |
                                                         
                                                          - ## License
                                                         
                                                          - MIT
