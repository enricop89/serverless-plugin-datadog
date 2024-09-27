import {
  isDefaultLambdaApiStep,
  isSafeToModifyStepFunctionInvoctation,
  StateMachineDefinition,
  updateDefinitionString,
} from "./step-functions-helper";

import Service from "serverless/classes/Service";

function serviceWithResources(resources?: Record<string, any>, serviceName = "my-service"): Service {
  const service = {
    getServiceName: () => serviceName,
    serverless: {
      cli: {
        log: () => "",
      },
    },
    provider: {
      name: "",
      stage: "",
      region: "",
      versionFunctions: true,
      compiledCloudFormationTemplate: {
        Resources: resources as any,
        Outputs: {},
      },
      logs: {
        restApi: true,
        httpApi: true,
        websocket: true,
      },
    },
  };
  return service as any;
}

describe("test updateDefinitionString", () => {
  const serverless = serviceWithResources().serverless;
  const stateMachineName = "fake-state-machine-name";

  it("test lambda step with non-object Parameters field", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":"Just a string!","Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters).toBe("Just a string!");
  });

  it("Case 4.1: test lambda step with default payload of '$'", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload.$":"$"},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload.$"]).toBe(
      "States.JsonMerge($$, $, false)",
    );
  });

  it("Case 4.3: test lambda step with empty payload", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload.$":{}},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload.$"]).toStrictEqual({});
  });

  it("Case 4.3: test lambda step with custom payload", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload.$":"$$.State"},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload.$"]).toBe("$$.State");
  });

  it("updates the definitionstring of a StepFunction with a string definitionString", async () => {
    const definitionString =
      '{"Comment":"Some comment","StartAt":"agocsTest1","States":{"agocsTest1":{"Type":"Task","Resource":"arn:aws:states:::states:startExecution.sync:2","Parameters":{"StateMachineArn":"arn:aws:states:::states:startExecution.sync:2","Input":{"foo":"bar"}},"End":true}}}';
    const newDefString = updateDefinitionString(definitionString, serverless, stateMachineName);

    expect(typeof newDefString === "string").toBeTruthy();
    expect(newDefString).toContain("CONTEXT");
  });

  it("Case 1: test lambda step without Payload or Payload.$", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name"},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload.$"]).toBe(
      "$$['Execution', 'State', 'StateMachine']",
    );
  });

  it("Case 3: test lambda step when Payload is not an object", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload":"Just a string!"},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload"]).toBe("Just a string!");
  });

  it("Case 2.1: test lambda step when Execution, State and StateMachine are already injected into Payload", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload":{"Execution.$":"$$.Execution","State.$":"$$.State","StateMachine.$":"$$.StateMachine"}},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload"]).toStrictEqual({
      "Execution.$": "$$.Execution",
      "State.$": "$$.State",
      "StateMachine.$": "$$.StateMachine",
    });
  });

  it("Case 2.2: test lambda step when some of Execution, State or StateMachine field but conject injection is not set up completely", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload":{"Execution":"$$.Execution"}},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload"]).toStrictEqual({
      Execution: "$$.Execution",
    });
  });

  it("Case 2.3: test lambda step when none of Execution, State, or StateMachine is in Payload", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload":{"CustomerId":42}},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload"]).toStrictEqual({
      CustomerId: 42,
      "Execution.$": "$$.Execution",
      "State.$": "$$.State",
      "StateMachine.$": "$$.StateMachine",
    });
  });

  it(`Case 4.2: test lambda step already has context injection set up using "Payload.$": "States.JsonMerge($$, $, false)"`, async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload.$":"States.JsonMerge($$, $, false)"},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload.$"]).toBe(
      "States.JsonMerge($$, $, false)",
    );
  });

  it(`Case 4.2: test lambda step already has context injection set up using "Payload.$": "$$['Execution', 'State', 'StateMachine']"`, async () => {
    const definitionString = {
      "Fn::Sub": [
        `{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload.$":"$$['Execution', 'State', 'StateMachine']"},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}`,
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload.$"]).toBe(
      `$$['Execution', 'State', 'StateMachine']`,
    );
  });

  it("Case 4.3: test lambda step has custom Payload.$ do nothing", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload.$":"something-customized"},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload.$"]).toBe("something-customized");
  });

  it("test lambda basic legacy integration do nothing", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Resource":"arn:aws:lambda:sa-east-1:601427271234:function:unit-test-function-name","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload.$"]).toBe(undefined);
  });

  it("test non-lambda steps do nothing", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeDynamodb":{"Type":"Task","Parameters":{"someKey":"someValue"},"Resource":"arn:aws:states:::dynamodb:updateItem","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeDynamodb).toStrictEqual({
      End: true,
      Parameters: { someKey: "someValue" },
      Resource: "arn:aws:states:::dynamodb:updateItem",
      Type: "Task",
    });
  });

  it("test legacy lambda api do nothing", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload.$":"$"},"Resource":"arn:aws:lambda:sa-east-1:601427271234:function:unit-test-function-name","End":true}}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda).toStrictEqual({
      End: true,
      Parameters: {
        FunctionName: "fake-function-name",
        "Payload.$": "$",
      },
      Resource: "arn:aws:lambda:sa-east-1:601427271234:function:unit-test-function-name",
      Type: "Task",
    });
  });

  it("test empty Fn::Sub", async () => {
    const definitionString = {
      "Fn::Sub": [],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    expect(definitionString["Fn::Sub"].length).toBe(0);
  });

  it("test step function invocation", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment": "A description of my state machine", "StartAt": "Step Functions StartExecution", "States": {"Step Functions StartExecution": {"Type": "Task", "Resource": "arn:aws:states:::states:startExecution", "Parameters": {"StateMachineArn": "arn:aws:states:us-east-1:425362996713:stateMachine:agocs-test-noop-state-machine-2", "Input": {"StatePayload": "Hello from Step Functions!", "AWS_STEP_FUNCTIONS_STARTED_BY_EXECUTION_ID.$": "$$.Execution.Id" }}, "End": true }}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States["Step Functions StartExecution"]?.Parameters?.Input?.["CONTEXT.$"]).toBe(
      "States.JsonMerge($$, $, false)",
    );
  });

  it("test step function invocation without input", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment": "A description of my state machine", "StartAt": "Step Functions StartExecution", "States": {"Step Functions StartExecution": {"Type": "Task", "Resource": "arn:aws:states:::states:startExecution", "Parameters": {"StateMachineArn": "arn:aws:states:us-east-1:425362996713:stateMachine:agocs-test-noop-state-machine-2"}, "End": true }}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States["Step Functions StartExecution"]?.Parameters?.Input?.["CONTEXT.$"]).toBe(
      "States.JsonMerge($$, $, false)",
    );
  });

  it("test step function invocation with pre-exisitng context object", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment": "A description of my state machine", "StartAt": "Step Functions StartExecution", "States": {"Step Functions StartExecution": {"Type": "Task", "Resource": "arn:aws:states:::states:startExecution", "Parameters": {"StateMachineArn": "arn:aws:states:us-east-1:425362996713:stateMachine:agocs-test-noop-state-machine-2", "Input": {"StatePayload": "Hello from Step Functions!", "AWS_STEP_FUNCTIONS_STARTED_BY_EXECUTION_ID.$": "$$.Execution.Id", "CONTEXT.$": "something else"}}, "End": true }}}',
        {},
      ],
    };
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States["Step Functions StartExecution"]?.Parameters?.Input?.["CONTEXT.$"]).toBe(
      "something else",
    );
  });
});

describe("test isSafeToModifyStepFunctionInvoctation", () => {
  it("Input field not set in parameters", async () => {
    const parameters = { StateMachineArn: "bla" };
    expect(isSafeToModifyStepFunctionInvoctation(parameters)).toBeTruthy();
  });

  it("Input field empty", async () => {
    const parameters = { FunctionName: "bla", Input: {} };
    expect(isSafeToModifyStepFunctionInvoctation(parameters)).toBeTruthy();
  });

  it("Input field is not an object", async () => {
    const parameters = { FunctionName: "bla", Input: "foo" };
    expect(isSafeToModifyStepFunctionInvoctation(parameters)).toBeFalsy();
  });

  it("Input field has stuff in it", async () => {
    const parameters = { FunctionName: "bla", Input: { foo: "bar" } };
    expect(isSafeToModifyStepFunctionInvoctation(parameters)).toBeTruthy();
  });

  it("Input field has CONTEXT.$ already", async () => {
    const parameters = { FunctionName: "bla", Input: { "CONTEXT.$": "something else" } };
    expect(isSafeToModifyStepFunctionInvoctation(parameters)).toBeFalsy();
  });
});

describe("test isDefaultLambdaApiStep", () => {
  it("resource is default lambda", async () => {
    const resource = "arn:aws:states:::lambda:invoke";
    expect(isDefaultLambdaApiStep(resource)).toBeTruthy();
  });

  it("resource is lambda arn for legacy lambda api", async () => {
    const resource = "arn:aws:lambda:sa-east-1:601427271234:function:hello-function";
    expect(isDefaultLambdaApiStep(resource)).toBeFalsy();
  });

  it("resource of dynamodb", async () => {
    const resource = "arn:aws:states:::dynamodb:updateItem";
    expect(isDefaultLambdaApiStep(resource)).toBeFalsy();
  });

  it("resource of empty string", async () => {
    const resource = "";
    expect(isDefaultLambdaApiStep(resource)).toBeFalsy();
  });

  it("resource of undefined", async () => {
    const resource = undefined;
    expect(isDefaultLambdaApiStep(resource)).toBeFalsy();
  });
});
