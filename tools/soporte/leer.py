import openpyxl, sys, json, collections, datetime
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
def hoja(n):
    ws = wb[n]; rows = [r for r in ws.iter_rows(values_only=True)]
    h = [str(x).strip() if x is not None else '' for x in rows[0]]
    return [dict(zip(h, r)) for r in rows[1:] if any(c not in (None, '') for c in r)]
