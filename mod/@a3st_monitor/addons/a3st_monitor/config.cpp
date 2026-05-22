class CfgPatches
{
	class a3st_monitor
	{
		units[] = {};
		weapons[] = {};
		requiredVersion = 0.1;
		requiredAddons[] = {"A3_Data_F"};
	};
};

class CfgFunctions
{
	class A3stMonitor
	{
		class Init
		{
			file = "\a3st_monitor";
			class initFunctions { postInit = 1; };
		};
	};
};
