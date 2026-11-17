"""Bottom-up materials cost per device for the planned 90-device run.

Every input below is an ESTIMATE (no lab invoices exist). Prices are catalogue list
prices found online in Nov 2026; geometry follows the project form (200x200 um
crosspoint, 150 nm active layer) plus assumed contact pads and traces.
The dominant cost is ink that is mixed or loaded but never printed (minimum batch
and cartridge-fill volumes), not the material that ends up in a device.
"""

N_DEVICES = 90                     # 9 loadings x 10 devices
LOADINGS_WT = [0, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16]

# --- prices (catalogue, USD) ---
AG_INK_USD_PER_G = 523.60 / 25     # Sigma-Aldrich 736465, 30-35 wt% Ag, 25 g
GO_USD_PER_MG = 468.0 / (50 * 4)   # Sigma-Aldrich 777676, 4 mg/mL, 50 mL (Krackeler)
CHITOSAN_USD_PER_G = 92.60 / 50    # Sigma-Aldrich 448877, 50 g (Krackeler)
PAPER_USD_PER_SHEET = 0.50         # assumed: coated photo paper, A4
OTHER_USD_RUN = 5.00               # assumed: acetic acid, ascorbic acid, DI water, wipes

# --- silver electrodes ---
AG_INK_DENSITY = 1.45              # g/mL (datasheet)
AG_CARTRIDGE_FILL_ML = 1.5         # assumed: one cartridge fill covers the whole run
ag_ink_run_g = AG_CARTRIDGE_FILL_ML * AG_INK_DENSITY
ag_in_device_g = (2 * 5e-2 * 5e-5) * 10.5 / 0.325  # 2 electrodes x 5 mm^2 x 0.5 um Ag, as ink mass

# --- CS-rGO ink: one batch per loading ---
BATCH_ML = 2.0                     # assumed minimum batch to fill a cartridge
CHITOSAN_MG_PER_ML = 10.0          # assumed 1 % w/v chitosan in dilute acetic acid
GO_LOSS_FACTOR = 2.0               # assumed: half the GO lost in reduction/centrifuging
go_mg = sum(BATCH_ML * CHITOSAN_MG_PER_ML * w / (100 - w) for w in LOADINGS_WT) * GO_LOSS_FACTOR
chitosan_g = len(LOADINGS_WT) * BATCH_ML * CHITOSAN_MG_PER_ML / 1000

# --- substrate ---
DEVICES_PER_SHEET = 40             # assumed incl. spacing and test structures
paper_sheets = -(-N_DEVICES // DEVICES_PER_SHEET) + 1  # +1 spare

items = {
    "Silver ink (one cartridge fill)": ag_ink_run_g * AG_INK_USD_PER_G,
    "Graphene oxide (9 batches)": go_mg * GO_USD_PER_MG,
    "Chitosan (9 batches)": chitosan_g * CHITOSAN_USD_PER_G,
    "Paper": paper_sheets * PAPER_USD_PER_SHEET,
    "Acids, water, wipes": OTHER_USD_RUN,
}
total = sum(items.values())
print(f"{'Item':34s} {'per run':>9s} {'per device':>11s}")
for k, v in items.items():
    print(f"{k:34s} ${v:8.2f} ${v / N_DEVICES:10.3f}")
print(f"{'TOTAL':34s} ${total:8.2f} ${total / N_DEVICES:10.3f}")
print(f"\nSilver ink actually printed per device: ${ag_in_device_g * AG_INK_USD_PER_G:.4f}")
print(f"GO used: {go_mg:.1f} mg over the run")
