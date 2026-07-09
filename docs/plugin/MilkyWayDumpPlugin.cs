// MWDump 1.2 — position dumps (F9) + occupied/lit cluster dumps (F10)
//
// Build exactly like v1.1 (legacy csc.exe, C# 5 syntax, reference
// netstandard.dll from DSPGAME_Data\Managed; game must be closed when
// copying the DLL into the profile). Same build command as before, this
// file just replaces MilkyWayDumpPlugin.cs.
//
// F9  = dump candidate positions for SeedStart..SeedEnd at the settings
//       constants below -> mwdump_{stars}_{res}_{suffix}_{start}-{end}.csv
// F10 = dump every LIT cluster the game currently has in memory
//       (seedKey, position, generation capacity, engineer count)
//       -> mwoccupied_{yyyyMMdd_HHmm}.csv
//       IMPORTANT: open the in-game Milky Way screen first so the game
//       downloads the leaderboard data; press F10 while it is visible.
//
// NOTE on F10 reflection: written against game ~0.10.34.x decompiles.
// If your version renames things, check these identifiers in your
// decompiled Assembly-CSharp and adjust:
//   - UIRoot.instance.uiGame.uiMilkyWay      (UI panel holding the data)
//   - field/property of type MilkyWayData on that panel ("milkyWayData")
//   - MilkyWayData collection of clusters ("clusters" / "clusterList")
//   - per-cluster fields: seedKey (long), pos/position (VectorLF3),
//     caps/generationCapacity (float/double), engineerCount (int)

using BepInEx;
using HarmonyLib;
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEngine;

[BepInPlugin("noor.dsp.mwdump", "MilkyWay Dumper", "1.2.0")]
public class MilkyWayDumpPlugin : BaseUnityPlugin
{
    const int MilkyWaySeed = 898;
    const int SeedStart = 0;
    const int SeedEnd = 1000000;      // raise for bigger dumps (max 100000000)
    const int SeedStep = 1;
    const int StarCount = 64;
    const int ResCode = 99;           // multiplier*10, 99 = infinite
    const int Suffix = 100;           // 0=peace, 100+fogDiff*10=combat(Z), 999=sandbox
    const int CallsPerFrame = 100000;

    // Optional flat-disk filter for F9: only write rows with |y| <= YFilter.
    // Set to e.g. 20.0 to cover the FULL 100M seed space in a manageable
    // file (~1/6 of rows survive). 0 = disabled (write everything).
    const double YFilter = 0;

    static bool running;

    void Awake()
    { Logger.LogInfo("MWDump 1.2 loaded. F9 = position dump, F10 = occupied dump."); }

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.F9) && !running) StartCoroutine(DumpCoroutine());
        if (Input.GetKeyDown(KeyCode.F10) && !running) DumpOccupied();
    }

    static long PackSeedKey(int galaxySeed, int starCount, int resCode, int suffix)
    { return (long)galaxySeed*100000000L + (long)starCount*100000L + (long)resCode*1000L + (long)suffix; }

    static MethodInfo FindPositionMethod()
    {
        var genType = AccessTools.TypeByName("MilkyWayGenerator");
        var method = (genType != null) ? AccessTools.Method(genType, "GenerateClusterPosition") : null;
        if (method == null)
        {
            var coordType = AccessTools.TypeByName("MilkyWay.MilkyWayCoordinator");
            method = AccessTools.Method(coordType, "CoordinateCluster");
        }
        return method;
    }

    IEnumerator DumpCoroutine()
    {
        running = true;
        string path = Path.Combine(Paths.GameRootPath,
            "mwdump_" + StarCount + "_" + ResCode + "_" + Suffix + "_" + SeedStart + "-" + SeedEnd + ".csv");
        var method = FindPositionMethod();
        StreamWriter w = new StreamWriter(path);
        try
        {
            w.WriteLine("seed,x,y,z");
            int inFrame = 0;
            for (int seed = SeedStart; seed < SeedEnd; seed += SeedStep)
            {
                long key = PackSeedKey(seed, StarCount, ResCode, Suffix);
                object posObj = method.Invoke(null, new object[] { MilkyWaySeed, key });
                VectorLF3 pos = (VectorLF3)posObj;
                if (YFilter <= 0 || (pos.y <= YFilter && pos.y >= -YFilter))
                    w.WriteLine(seed + "," + pos.x.ToString("R") + "," + pos.y.ToString("R") + "," + pos.z.ToString("R"));
                inFrame++;
                if (inFrame >= CallsPerFrame) { inFrame = 0; yield return null; }
            }
        }
        finally { w.Close(); }
        Logger.LogInfo("[MWDump] position dump done.");
        running = false;
    }

    // ---- F10: dump the lit clusters the game has downloaded ----

    static object GetFieldOrProp(object obj, string[] names)
    {
        if (obj == null) return null;
        Type t = obj.GetType();
        for (int i = 0; i < names.Length; i++)
        {
            var f = AccessTools.Field(t, names[i]);
            if (f != null) return f.GetValue(obj);
            var p = AccessTools.Property(t, names[i]);
            if (p != null) return p.GetValue(obj, null);
        }
        return null;
    }

    void DumpOccupied()
    {
        running = true;
        try
        {
            // 1) find the MilkyWayData instance via the UI panel
            var uiRootType = AccessTools.TypeByName("UIRoot");
            object uiRootInst = AccessTools.Property(uiRootType, "instance") != null
                ? AccessTools.Property(uiRootType, "instance").GetValue(null, null)
                : AccessTools.Field(uiRootType, "instance").GetValue(null);
            object uiGame = GetFieldOrProp(uiRootInst, new string[] { "uiGame" });
            object uiMilkyWay = GetFieldOrProp(uiGame, new string[] { "uiMilkyWay", "milkyWay" });
            object data = GetFieldOrProp(uiMilkyWay, new string[] { "milkyWayData", "data" });
            if (data == null)
            {
                Logger.LogWarning("[MWDump] no MilkyWayData — open the Milky Way screen first, then press F10.");
                return;
            }

            // 2) enumerate clusters
            object clusters = GetFieldOrProp(data, new string[] { "clusters", "clusterList", "clusterDatas", "loadedClusters" });
            IEnumerable seq = clusters as IEnumerable;
            if (seq == null)
            {
                Logger.LogWarning("[MWDump] cluster collection not found — adjust field names (see header comment).");
                return;
            }

            string path = Path.Combine(Paths.GameRootPath,
                "mwoccupied_" + DateTime.Now.ToString("yyyyMMdd_HHmm") + ".csv");
            int rows = 0;
            StreamWriter w = new StreamWriter(path);
            try
            {
                w.WriteLine("seedkey,x,y,z,caps,engineers");
                foreach (object c in seq)
                {
                    if (c == null) continue;
                    object keyObj = GetFieldOrProp(c, new string[] { "seedKey", "seedkey", "key" });
                    object posObj = GetFieldOrProp(c, new string[] { "pos", "position", "coordinate" });
                    object capsObj = GetFieldOrProp(c, new string[] { "caps", "generationCapacity", "capacity", "power" });
                    object engObj = GetFieldOrProp(c, new string[] { "engineerCount", "engineers", "engineerCnt" });
                    if (keyObj == null || posObj == null) continue;
                    long key = Convert.ToInt64(keyObj);
                    VectorLF3 pos = (VectorLF3)posObj;
                    double caps = capsObj != null ? Convert.ToDouble(capsObj) : 0.0;
                    int eng = engObj != null ? Convert.ToInt32(engObj) : 0;
                    w.WriteLine(key + "," + pos.x.ToString("R") + "," + pos.y.ToString("R") + "," + pos.z.ToString("R")
                        + "," + caps.ToString("R") + "," + eng);
                    rows++;
                }
            }
            finally { w.Close(); }
            Logger.LogInfo("[MWDump] occupied dump done: " + rows + " clusters -> " + path);
        }
        catch (Exception ex)
        {
            Logger.LogError("[MWDump] occupied dump failed: " + ex);
        }
        finally { running = false; }
    }
}
