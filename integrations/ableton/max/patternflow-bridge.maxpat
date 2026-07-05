{
	"patcher": {
		"fileversion": 1,
		"appversion": {
			"major": 8,
			"minor": 6,
			"revision": 0,
			"architecture": "x64",
			"modernui": 1
		},
		"classnamespace": "box",
		"rect": [59.0, 106.0, 860.0, 700.0],
		"bglocked": 0,
		"openinpresentation": 1,
		"default_fontsize": 12.0,
		"default_fontface": 0,
		"default_fontname": "Arial",
		"gridonopen": 1,
		"gridsize": [15.0, 15.0],
		"gridsnaponopen": 1,
		"objectsnaponopen": 1,
		"statusbarvisible": 2,
		"toolbarvisible": 1,
		"boxes": [
			{
				"box": {
					"id": "obj-61",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [24.0, 16.0, 220.0, 20.0],
					"presentation": 1,
					"presentation_rect": [4.0, 2.0, 220.0, 18.0],
					"text": "PATTERNFLOW BRIDGE"
				}
			},
			{
				"box": {
					"id": "obj-62",
					"maxclass": "comment",
					"fontsize": 10.0,
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [260.0, 16.0, 460.0, 20.0],
					"presentation": 1,
					"presentation_rect": [4.0, 124.0, 452.0, 40.0],
					"text": "Click a parameter in Live then Map (or Map first, then the parameter). Turn a Patternflow knob to move it. Sweep = encoder clicks for the full range (24 = one physical turn)."
				}
			},
			{
				"box": {
					"id": "obj-1",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [24.0, 60.0, 120.0, 22.0],
					"text": "udpreceive 9000"
				}
			},
			{
				"box": {
					"id": "obj-2",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 11,
					"outlettype": ["", "", "", "", "", "", "", "", "", "", ""],
					"patching_rect": [24.0, 130.0, 300.0, 22.0],
					"text": "js patternflow.bridge.js",
					"varname": "pf_bridge"
				}
			},
			{
				"box": {
					"id": "obj-3",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [24.0, 240.0, 80.0, 22.0],
					"text": "live.remote~"
				}
			},
			{
				"box": {
					"id": "obj-4",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [114.0, 240.0, 80.0, 22.0],
					"text": "live.remote~"
				}
			},
			{
				"box": {
					"id": "obj-5",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [204.0, 240.0, 80.0, 22.0],
					"text": "live.remote~"
				}
			},
			{
				"box": {
					"id": "obj-6",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [294.0, 240.0, 80.0, 22.0],
					"text": "live.remote~"
				}
			},
			{
				"box": {
					"id": "obj-70",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"outlettype": ["", ""],
					"patching_rect": [24.0, 160.0, 60.0, 22.0],
					"text": "route id"
				}
			},
			{
				"box": {
					"id": "obj-71",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"outlettype": ["", ""],
					"patching_rect": [114.0, 160.0, 60.0, 22.0],
					"text": "route id"
				}
			},
			{
				"box": {
					"id": "obj-72",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"outlettype": ["", ""],
					"patching_rect": [204.0, 160.0, 60.0, 22.0],
					"text": "route id"
				}
			},
			{
				"box": {
					"id": "obj-73",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"outlettype": ["", ""],
					"patching_rect": [294.0, 160.0, 60.0, 22.0],
					"text": "route id"
				}
			},
			{
				"box": {
					"id": "obj-74",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [44.0, 196.0, 70.0, 22.0],
					"text": "prepend id"
				}
			},
			{
				"box": {
					"id": "obj-75",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [134.0, 196.0, 70.0, 22.0],
					"text": "prepend id"
				}
			},
			{
				"box": {
					"id": "obj-76",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [224.0, 196.0, 70.0, 22.0],
					"text": "prepend id"
				}
			},
			{
				"box": {
					"id": "obj-77",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [314.0, 196.0, 70.0, 22.0],
					"text": "prepend id"
				}
			},
			{
				"box": {
					"id": "obj-7",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [404.0, 210.0, 190.0, 22.0],
					"text": "udpsend patternflow.local 9001"
				}
			},
			{
				"box": {
					"id": "obj-8",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": ["bang", "int", "int"],
					"patching_rect": [480.0, 60.0, 100.0, 22.0],
					"text": "live.thisdevice"
				}
			},
			{
				"box": {
					"id": "obj-9",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [480.0, 96.0, 40.0, 22.0],
					"text": "init"
				}
			},
			{
				"box": {
					"id": "obj-10",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 2,
					"outlettype": ["signal", "signal"],
					"patching_rect": [660.0, 60.0, 60.0, 22.0],
					"text": "plugin~"
				}
			},
			{
				"box": {
					"id": "obj-11",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"outlettype": ["signal", "signal"],
					"patching_rect": [660.0, 110.0, 68.0, 22.0],
					"text": "plugout~"
				}
			},
			{
				"box": {
					"id": "obj-12",
					"maxclass": "textedit",
					"numinlets": 1,
					"numoutlets": 4,
					"outlettype": ["", "", "", ""],
					"patching_rect": [24.0, 300.0, 150.0, 22.0],
					"presentation": 1,
					"presentation_rect": [4.0, 24.0, 140.0, 20.0],
					"text": "patternflow.local",
					"varname": "host_field"
				}
			},
			{
				"box": {
					"id": "obj-13",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [24.0, 336.0, 110.0, 22.0],
					"text": "prepend sethost"
				}
			},
			{
				"box": {
					"id": "obj-14",
					"maxclass": "textbutton",
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": ["", "", ""],
					"parameter_enable": 0,
					"patching_rect": [190.0, 300.0, 70.0, 22.0],
					"presentation": 1,
					"presentation_rect": [148.0, 24.0, 64.0, 20.0],
					"text": "Connect"
				}
			},
			{
				"box": {
					"id": "obj-15",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [190.0, 336.0, 60.0, 22.0],
					"text": "connect"
				}
			},
			{
				"box": {
					"id": "obj-16",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [290.0, 300.0, 240.0, 22.0],
					"presentation": 1,
					"presentation_rect": [216.0, 24.0, 240.0, 20.0],
					"text": "offline"
				}
			},
			{
				"box": {
					"id": "obj-21",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [24.0, 390.0, 40.0, 20.0],
					"presentation": 1,
					"presentation_rect": [4.0, 52.0, 40.0, 18.0],
					"text": "K1"
				}
			},
			{
				"box": {
					"id": "obj-22",
					"maxclass": "textbutton",
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": ["", "", ""],
					"parameter_enable": 0,
					"patching_rect": [24.0, 414.0, 52.0, 22.0],
					"presentation": 1,
					"presentation_rect": [4.0, 70.0, 52.0, 20.0],
					"text": "Map 1"
				}
			},
			{
				"box": {
					"id": "obj-23",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [24.0, 444.0, 50.0, 22.0],
					"text": "map 1"
				}
			},
			{
				"box": {
					"id": "obj-24",
					"maxclass": "textbutton",
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": ["", "", ""],
					"parameter_enable": 0,
					"patching_rect": [80.0, 414.0, 52.0, 22.0],
					"presentation": 1,
					"presentation_rect": [60.0, 70.0, 52.0, 20.0],
					"text": "Clear"
				}
			},
			{
				"box": {
					"id": "obj-25",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [80.0, 444.0, 54.0, 22.0],
					"text": "clear 1"
				}
			},
			{
				"box": {
					"id": "obj-26",
					"maxclass": "number",
					"numinlets": 1,
					"numoutlets": 2,
					"outlettype": ["", "bang"],
					"patching_rect": [24.0, 478.0, 52.0, 22.0],
					"presentation": 1,
					"presentation_rect": [4.0, 96.0, 52.0, 20.0]
				}
			},
			{
				"box": {
					"id": "obj-27",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [24.0, 508.0, 110.0, 22.0],
					"text": "prepend sweep 1"
				}
			},
			{
				"box": {
					"id": "obj-28",
					"maxclass": "comment",
					"fontsize": 10.0,
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [80.0, 478.0, 50.0, 20.0],
					"presentation": 1,
					"presentation_rect": [60.0, 98.0, 50.0, 18.0],
					"text": "sweep"
				}
			},
			{
				"box": {
					"id": "obj-31",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [164.0, 390.0, 40.0, 20.0],
					"presentation": 1,
					"presentation_rect": [118.0, 52.0, 40.0, 18.0],
					"text": "K2"
				}
			},
			{
				"box": {
					"id": "obj-32",
					"maxclass": "textbutton",
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": ["", "", ""],
					"parameter_enable": 0,
					"patching_rect": [164.0, 414.0, 52.0, 22.0],
					"presentation": 1,
					"presentation_rect": [118.0, 70.0, 52.0, 20.0],
					"text": "Map 2"
				}
			},
			{
				"box": {
					"id": "obj-33",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [164.0, 444.0, 50.0, 22.0],
					"text": "map 2"
				}
			},
			{
				"box": {
					"id": "obj-34",
					"maxclass": "textbutton",
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": ["", "", ""],
					"parameter_enable": 0,
					"patching_rect": [220.0, 414.0, 52.0, 22.0],
					"presentation": 1,
					"presentation_rect": [174.0, 70.0, 52.0, 20.0],
					"text": "Clear"
				}
			},
			{
				"box": {
					"id": "obj-35",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [220.0, 444.0, 54.0, 22.0],
					"text": "clear 2"
				}
			},
			{
				"box": {
					"id": "obj-36",
					"maxclass": "number",
					"numinlets": 1,
					"numoutlets": 2,
					"outlettype": ["", "bang"],
					"patching_rect": [164.0, 478.0, 52.0, 22.0],
					"presentation": 1,
					"presentation_rect": [118.0, 96.0, 52.0, 20.0]
				}
			},
			{
				"box": {
					"id": "obj-37",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [164.0, 508.0, 110.0, 22.0],
					"text": "prepend sweep 2"
				}
			},
			{
				"box": {
					"id": "obj-38",
					"maxclass": "comment",
					"fontsize": 10.0,
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [220.0, 478.0, 50.0, 20.0],
					"presentation": 1,
					"presentation_rect": [174.0, 98.0, 50.0, 18.0],
					"text": "sweep"
				}
			},
			{
				"box": {
					"id": "obj-41",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [304.0, 390.0, 40.0, 20.0],
					"presentation": 1,
					"presentation_rect": [232.0, 52.0, 40.0, 18.0],
					"text": "K3"
				}
			},
			{
				"box": {
					"id": "obj-42",
					"maxclass": "textbutton",
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": ["", "", ""],
					"parameter_enable": 0,
					"patching_rect": [304.0, 414.0, 52.0, 22.0],
					"presentation": 1,
					"presentation_rect": [232.0, 70.0, 52.0, 20.0],
					"text": "Map 3"
				}
			},
			{
				"box": {
					"id": "obj-43",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [304.0, 444.0, 50.0, 22.0],
					"text": "map 3"
				}
			},
			{
				"box": {
					"id": "obj-44",
					"maxclass": "textbutton",
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": ["", "", ""],
					"parameter_enable": 0,
					"patching_rect": [360.0, 414.0, 52.0, 22.0],
					"presentation": 1,
					"presentation_rect": [288.0, 70.0, 52.0, 20.0],
					"text": "Clear"
				}
			},
			{
				"box": {
					"id": "obj-45",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [360.0, 444.0, 54.0, 22.0],
					"text": "clear 3"
				}
			},
			{
				"box": {
					"id": "obj-46",
					"maxclass": "number",
					"numinlets": 1,
					"numoutlets": 2,
					"outlettype": ["", "bang"],
					"patching_rect": [304.0, 478.0, 52.0, 22.0],
					"presentation": 1,
					"presentation_rect": [232.0, 96.0, 52.0, 20.0]
				}
			},
			{
				"box": {
					"id": "obj-47",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [304.0, 508.0, 110.0, 22.0],
					"text": "prepend sweep 3"
				}
			},
			{
				"box": {
					"id": "obj-48",
					"maxclass": "comment",
					"fontsize": 10.0,
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [360.0, 478.0, 50.0, 20.0],
					"presentation": 1,
					"presentation_rect": [288.0, 98.0, 50.0, 18.0],
					"text": "sweep"
				}
			},
			{
				"box": {
					"id": "obj-51",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [444.0, 390.0, 40.0, 20.0],
					"presentation": 1,
					"presentation_rect": [346.0, 52.0, 40.0, 18.0],
					"text": "K4"
				}
			},
			{
				"box": {
					"id": "obj-52",
					"maxclass": "textbutton",
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": ["", "", ""],
					"parameter_enable": 0,
					"patching_rect": [444.0, 414.0, 52.0, 22.0],
					"presentation": 1,
					"presentation_rect": [346.0, 70.0, 52.0, 20.0],
					"text": "Map 4"
				}
			},
			{
				"box": {
					"id": "obj-53",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [444.0, 444.0, 50.0, 22.0],
					"text": "map 4"
				}
			},
			{
				"box": {
					"id": "obj-54",
					"maxclass": "textbutton",
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": ["", "", ""],
					"parameter_enable": 0,
					"patching_rect": [500.0, 414.0, 52.0, 22.0],
					"presentation": 1,
					"presentation_rect": [402.0, 70.0, 52.0, 20.0],
					"text": "Clear"
				}
			},
			{
				"box": {
					"id": "obj-55",
					"maxclass": "message",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [500.0, 444.0, 54.0, 22.0],
					"text": "clear 4"
				}
			},
			{
				"box": {
					"id": "obj-56",
					"maxclass": "number",
					"numinlets": 1,
					"numoutlets": 2,
					"outlettype": ["", "bang"],
					"patching_rect": [444.0, 478.0, 52.0, 22.0],
					"presentation": 1,
					"presentation_rect": [346.0, 96.0, 52.0, 20.0]
				}
			},
			{
				"box": {
					"id": "obj-57",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [""],
					"patching_rect": [444.0, 508.0, 110.0, 22.0],
					"text": "prepend sweep 4"
				}
			},
			{
				"box": {
					"id": "obj-58",
					"maxclass": "comment",
					"fontsize": 10.0,
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [500.0, 478.0, 50.0, 20.0],
					"presentation": 1,
					"presentation_rect": [402.0, 98.0, 50.0, 18.0],
					"text": "sweep"
				}
			},
			{
				"box": {
					"id": "obj-60",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": ["", "", ""],
					"patching_rect": [480.0, 130.0, 290.0, 22.0],
					"text": "pattr mappings @bindto pf_bridge @autorestore 1"
				}
			}
		],
		"lines": [
			{ "patchline": { "source": ["obj-1", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-2", 0], "destination": ["obj-70", 0] } },
			{ "patchline": { "source": ["obj-2", 1], "destination": ["obj-71", 0] } },
			{ "patchline": { "source": ["obj-2", 2], "destination": ["obj-72", 0] } },
			{ "patchline": { "source": ["obj-2", 3], "destination": ["obj-73", 0] } },
			{ "patchline": { "source": ["obj-70", 0], "destination": ["obj-74", 0] } },
			{ "patchline": { "source": ["obj-71", 0], "destination": ["obj-75", 0] } },
			{ "patchline": { "source": ["obj-72", 0], "destination": ["obj-76", 0] } },
			{ "patchline": { "source": ["obj-73", 0], "destination": ["obj-77", 0] } },
			{ "patchline": { "source": ["obj-74", 0], "destination": ["obj-3", 1] } },
			{ "patchline": { "source": ["obj-75", 0], "destination": ["obj-4", 1] } },
			{ "patchline": { "source": ["obj-76", 0], "destination": ["obj-5", 1] } },
			{ "patchline": { "source": ["obj-77", 0], "destination": ["obj-6", 1] } },
			{ "patchline": { "source": ["obj-70", 1], "destination": ["obj-3", 0] } },
			{ "patchline": { "source": ["obj-71", 1], "destination": ["obj-4", 0] } },
			{ "patchline": { "source": ["obj-72", 1], "destination": ["obj-5", 0] } },
			{ "patchline": { "source": ["obj-73", 1], "destination": ["obj-6", 0] } },
			{ "patchline": { "source": ["obj-2", 4], "destination": ["obj-16", 0] } },
			{ "patchline": { "source": ["obj-2", 5], "destination": ["obj-7", 0] } },
			{ "patchline": { "source": ["obj-2", 6], "destination": ["obj-26", 0] } },
			{ "patchline": { "source": ["obj-2", 7], "destination": ["obj-36", 0] } },
			{ "patchline": { "source": ["obj-2", 8], "destination": ["obj-46", 0] } },
			{ "patchline": { "source": ["obj-2", 9], "destination": ["obj-56", 0] } },
			{ "patchline": { "source": ["obj-2", 10], "destination": ["obj-12", 0] } },
			{ "patchline": { "source": ["obj-8", 0], "destination": ["obj-9", 0] } },
			{ "patchline": { "source": ["obj-9", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-10", 0], "destination": ["obj-11", 0] } },
			{ "patchline": { "source": ["obj-10", 1], "destination": ["obj-11", 1] } },
			{ "patchline": { "source": ["obj-12", 0], "destination": ["obj-13", 0] } },
			{ "patchline": { "source": ["obj-13", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-14", 0], "destination": ["obj-15", 0] } },
			{ "patchline": { "source": ["obj-15", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-22", 0], "destination": ["obj-23", 0] } },
			{ "patchline": { "source": ["obj-23", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-24", 0], "destination": ["obj-25", 0] } },
			{ "patchline": { "source": ["obj-25", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-26", 0], "destination": ["obj-27", 0] } },
			{ "patchline": { "source": ["obj-27", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-32", 0], "destination": ["obj-33", 0] } },
			{ "patchline": { "source": ["obj-33", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-34", 0], "destination": ["obj-35", 0] } },
			{ "patchline": { "source": ["obj-35", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-36", 0], "destination": ["obj-37", 0] } },
			{ "patchline": { "source": ["obj-37", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-42", 0], "destination": ["obj-43", 0] } },
			{ "patchline": { "source": ["obj-43", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-44", 0], "destination": ["obj-45", 0] } },
			{ "patchline": { "source": ["obj-45", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-46", 0], "destination": ["obj-47", 0] } },
			{ "patchline": { "source": ["obj-47", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-52", 0], "destination": ["obj-53", 0] } },
			{ "patchline": { "source": ["obj-53", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-54", 0], "destination": ["obj-55", 0] } },
			{ "patchline": { "source": ["obj-55", 0], "destination": ["obj-2", 0] } },
			{ "patchline": { "source": ["obj-56", 0], "destination": ["obj-57", 0] } },
			{ "patchline": { "source": ["obj-57", 0], "destination": ["obj-2", 0] } }
		],
		"dependency_cache": [],
		"autosave": 0
	}
}
