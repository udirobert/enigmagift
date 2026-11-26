# KaneCLI evidence index

Evidence scan window: **26 Nov 2026, from 2026-11-26T16:55:00Z**. Evidence packs themselves are local zip files (`.testmuai/evidence/`, gitignored); public judge evidence is the Test Manager share link where Kane uploaded one.

## Final deploy-gate result

- Gate completed: `2026-11-26T18:08:15.895Z`
- Result: **13/13 selected tests passed; 0 failures; 0 unresolved variables**
- Suite integrity: every group had a valid plan, a final summary, a completion event, and all expected member-end events.

| Gate group | Tests | Passed | Failed/broken/skipped | Status |
| --- | ---: | ---: | ---: | --- |
| `http://127.0.0.1:4299/?photo=1` | 7 | 7 | 0/0/0 | passed |
| `http://127.0.0.1:4299/?photo=1#gift=3122SmjCkTpzLUiJ2d7K94mGPEuSlNdazoP05LyhFAo` | 1 | 1 | 0/0/0 | passed |
| `http://127.0.0.1:4299/?photo=1#gift=dlpd5SBzIZoympnjkIjm8MoTUFZOTYKulkZFy2EEX6w` | 1 | 1 | 0/0/0 | passed |
| `http://127.0.0.1:4299/?photo=1#gift=EI6vsiVmHpOrUPzEn0aWFLd4FxlS9l4YnnLrDDTjk2c` | 4 | 4 | 0/0/0 | passed |

## Test evidence rows

**13 active suite tests indexed; 13 rows have public Test Manager links.** Rows are deduplicated by active test title. Where several runs exist, the latest passing public share is preferred; otherwise the latest passing local replay row is shown.

| Test | Status | Duration | Evidence | Local pack |
| --- | --- | ---: | --- | --- |
| `Centre then move the paper marker before continuing` | passed | 170s | [open](https://test-manager.lambdatest.com/projects/01M8C8T74S2D94HF6M564NHHNJ/test-cases/01M8CCP88QAZZ7HQEC8XMNVNFS/dashboard/share/US_2S1SUKXI196AORXYVMMBT5ZYLIVLSE1CII4IA6Y2GUXBXYGQLSXNX6V349JD0AO3?type=summary&agentView=true&fqdn=summary-page) | `0bd8920c-3dc0-497d-affc-f11add241223.evidence` |
| `Closed recipient links never show the hunt` | passed | 88s | [open](https://test-manager.lambdatest.com/projects/01M8C8T74S2D94HF6M564NHHNJ/test-cases/01M8CCHXGXNYCPY6T7Q72ZB14D/dashboard/share/US_P2UK6VJ59RSHN1X55PZVX6QM3BXHS1U9LFEY3UV5KVKB63REUUZVGJBGSLXXAU78?type=summary&agentView=true&fqdn=summary-page) | `f6b6888d-34da-47d5-8710-c8ae74182916.evidence` |
| `Clue entry stops at 200 characters` | passed | 128s | [open](https://test-manager.lambdatest.com/projects/01M8C8T74S2D94HF6M564NHHNJ/test-cases/01M8CCP9MWW7XZ3CREZC2VKVRQ/dashboard/share/US_FXX7I8O5BGZR8T6EIXRQ44TKMU7WADNXLQ3SGFTG2VITXLYTK0KZRG9HPGWUUEMB?type=summary&agentView=true&fqdn=summary-page) | `c4fea208-7758-4a64-86d8-b34011a6ee91.evidence` |
| `Create and review a tapped-spot photo gift` | passed | 302s | [open](https://test-manager.lambdatest.com/projects/01M8C8T74S2D94HF6M564NHHNJ/test-cases/01M8CCTR0NFJRJJ97CET4D1BBQ/dashboard/share/US_LK50NIG2EJ4UPJ00645F7ULU8488LN6TE1UZDQ7PE8G07BR9O3DDUAIP6RJ4VE2R?type=summary&agentView=true&fqdn=summary-page) | `8a265579-ba44-4d81-a61c-89252318851c.evidence` |
| `Editing creates a new link without changing the earlier gift` | passed | 155s | [open](https://test-manager.lambdatest.com/projects/01M8C8T74S2D94HF6M564NHHNJ/test-cases/01M8CCY7DXW1PY2YEEF61N6SM3/dashboard/share/US_8TJTNBDRYAHM73WLUIXMQNIMK7ZJ9MJQ7SKRQDTTTAYL3BB0BRKGFJPJWF5EEH9G?type=summary&agentView=true&fqdn=summary-page) | `6b312711-7b42-46bc-9bb5-8fc6b89786a5.evidence` |
| `Failed recipient photo leaves direct access to letter` | passed | 62s | [open](https://test-manager.lambdatest.com/projects/01M8C8T74S2D94HF6M564NHHNJ/test-cases/01M8CGB9XY24QTGWXA04C636FD/dashboard/share/US_CHD5J8DNDBZ23WYSNTCRUBYRB83FLOQRF6GD8ZJF08HPGSO19WDJ55IO1MVH5VHG?type=summary&agentView=true&fqdn=summary-page) | `e0bd8827-134e-4d70-9540-1096f30c663f.evidence` |
| `Find, read and replay a recipient photo gift` | passed | 253s | [open](https://test-manager.lambdatest.com/projects/01M8C8T74S2D94HF6M564NHHNJ/test-cases/01M8CGDVM8MAP2SW9T4QDB65A7/dashboard/share/US_78IPDV4LKC9PLVTW3GJ58JAFOD8EMG2WWI2LBPKI9GF5O4BUEES0UMHHBNY2032E?type=summary&agentView=true&fqdn=summary-page) | `7c1913ea-f339-4b1f-9103-5d74060a293a.evidence` |
| `Incorrect named area reports that region` | passed | 74s | [open](https://test-manager.lambdatest.com/projects/01M8C8T74S2D94HF6M564NHHNJ/test-cases/01M8CGDXWG2GPSXNFM641YA01S/dashboard/share/US_GYGTY3LLTHI6YIQAVTXMOUHXT7QP983IZIERKOEZWA49NYX5CYDK4G45RWBWHJFF?type=summary&agentView=true&fqdn=summary-page) | `5fa4b9bf-0c27-464a-8635-a8e1e8b61f57.evidence` |
| `Second hint reveals folded note and preserves draft on return` | passed | 195s | [open](https://test-manager.lambdatest.com/projects/01M8C8T74S2D94HF6M564NHHNJ/test-cases/01M8CERQVN8564QR1D9X2SB9HQ/dashboard/share/US_ZO3LRXXMLRA1GF1JVOVR50AIHIXXCB7V7IJN1OIFKVTFU7SV020P7QIHIRBNP2RX?type=summary&agentView=true&fqdn=summary-page) | `09cfe902-7085-490a-bfe6-4dcb7f737390.evidence` |
| `Second hint reveals the folded note` | passed | 99s | [open](https://test-manager.lambdatest.com/projects/01M8C8T74S2D94HF6M564NHHNJ/test-cases/01M8CGDZQ7B6501PECNXKHX17D/dashboard/share/US_4R1NEGWVFSQOLM0XMXF8AUXVA9MNN3AVC473NY0ZV3M8WDF7KLY6U810FUD79CYO?type=summary&agentView=true&fqdn=summary-page) | `caa9753f-d056-4715-b0ea-70122b729286.evidence` |
| `Unsaved recipient hunt opens the letter and returns to the unchanged draft` | passed | 201s | [open](https://test-manager.lambdatest.com/projects/01M8C8T74S2D94HF6M564NHHNJ/test-cases/01M8CERRN3486EDYJ9QAYB4QRN/dashboard/share/US_J7ISWPR5VJSVINSMKMMFL6KD10RSQAJJYV1OAFFEW25JUG0SHLPTWRAYJ5H8115T?type=summary&agentView=true&fqdn=summary-page) | `09cfe902-7085-490a-bfe6-4dcb7f737390.evidence` |
| `Wrong area in unsaved hunt reports a miss without changing draft` | passed | 249s | [open](https://test-manager.lambdatest.com/projects/01M8C8T74S2D94HF6M564NHHNJ/test-cases/01M8CERSAY33TM1YBDE37AVB57/dashboard/share/US_ZUHWV4WZKK2F93Z3CT0JX9CUQ8CZT2S3FXGMH6YC9BJ8JT6Z5U6F2SNPFCH8ODCH?type=summary&agentView=true&fqdn=summary-page) | `09cfe902-7085-490a-bfe6-4dcb7f737390.evidence` |
| `Wrong photo tap gives gentle miss feedback` | passed | 76s | [open](https://test-manager.lambdatest.com/projects/01M8C8T74S2D94HF6M564NHHNJ/test-cases/01M8CGE1TFFATH4G87FBJPM8M9/dashboard/share/US_CDVRCGZISJ37CQJ53KMOKPVKGKR4QL0KS954U8CTRD6HKX1GX50E6RFXWZPBIO45?type=summary&agentView=true&fqdn=summary-page) | `ef73685f-a020-4caa-989f-7cf0c5ea6250.evidence` |

## Interpretation

- The final gate passed the complete active release-blocking suite: 13/13 tests across creator, edit-versioning, preview, recipient, closed-link, wrong-input and broken-image behaviour.
- Kane replays that reuse cached authored steps do not always create a fresh public Test Manager share link. Those rows are labelled local replay; the gate still requires their fresh pass in the final NDJSON stream before deployment can proceed.
- Earlier red rows are not hidden: deadline-day failures exposed requirement/test drift in format handling, persistent storage, recipient-control expectations and edit-link navigation. Triage is recorded in `notes/KANECLI-HACKATHON.md` and the submission narrative.
- Superseded tests remain in `.testmuai/tests/superseded/` for audit; they are not release-blocking suite members.
- Explicit coverage debt: replacement creator-side tests for multi-format input normalization, blocked persistent storage and saved-recipient preview still need to be redesigned/authored after the deadline-day drift triage.
